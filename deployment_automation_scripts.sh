#!/bin/bash
# Production Deployment Automation Scripts
# Complete end-to-end deployment for Advanced Trades Management Platform

set -e

# =================================================================
# CONFIGURATION
# =================================================================

PROJECT_NAME="trades-platform"
ENVIRONMENT="production"
AWS_REGION="us-east-1"
ECR_REGISTRY="123456789.dkr.ecr.us-east-1.amazonaws.com"
EKS_CLUSTER_NAME="trades-platform-cluster"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =================================================================
# UTILITY FUNCTIONS
# =================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check required tools
    local tools=("docker" "kubectl" "aws" "helm")
    for tool in "${tools[@]}"; do
        if ! command -v $tool &> /dev/null; then
            error "$tool is required but not installed"
        fi
    done
    
    # Check AWS authentication
    if ! aws sts get-caller-identity &> /dev/null; then
        error "AWS authentication failed. Please run 'aws configure'"
    fi
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
    fi
    
    success "Prerequisites check passed"
}

# =================================================================
# INFRASTRUCTURE SETUP
# =================================================================

setup_infrastructure() {
    log "Setting up AWS infrastructure..."
    
    # Create EKS cluster if it doesn't exist
    if ! aws eks describe-cluster --name $EKS_CLUSTER_NAME --region $AWS_REGION &> /dev/null; then
        log "Creating EKS cluster..."
        eksctl create cluster \
            --name $EKS_CLUSTER_NAME \
            --region $AWS_REGION \
            --version 1.28 \
            --nodegroup-name standard-workers \
            --node-type t3.medium \
            --nodes 3 \
            --nodes-min 2 \
            --nodes-max 10 \
            --managed
        
        success "EKS cluster created"
    else
        success "EKS cluster already exists"
    fi
    
    # Update kubeconfig
    aws eks update-kubeconfig --region $AWS_REGION --name $EKS_CLUSTER_NAME
    
    # Create ECR repositories if they don't exist
    local repos=("backend" "admin-dashboard" "mobile-api")
    for repo in "${repos[@]}"; do
        if ! aws ecr describe-repositories --repository-names "$PROJECT_NAME/$repo" --region $AWS_REGION &> /dev/null; then
            log "Creating ECR repository: $PROJECT_NAME/$repo"
            aws ecr create-repository \
                --repository-name "$PROJECT_NAME/$repo" \
                --region $AWS_REGION \
                --image-scanning-configuration scanOnPush=true
        fi
    done
    
    success "Infrastructure setup completed"
}

# =================================================================
# DATABASE SETUP
# =================================================================

setup_database() {
    log "Setting up RDS PostgreSQL database..."
    
    # Create RDS subnet group
    local subnet_group_name="$PROJECT_NAME-db-subnet-group"
    if ! aws rds describe-db-subnet-groups --db-subnet-group-name $subnet_group_name --region $AWS_REGION &> /dev/null; then
        log "Creating DB subnet group..."
        
        # Get VPC subnets from EKS cluster
        local vpc_id=$(aws eks describe-cluster --name $EKS_CLUSTER_NAME --region $AWS_REGION --query 'cluster.resourcesVpcConfig.vpcId' --output text)
        local subnets=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc_id" "Name=tag:kubernetes.io/role/internal-elb,Values=1" --query 'Subnets[].SubnetId' --output text)
        
        aws rds create-db-subnet-group \
            --db-subnet-group-name $subnet_group_name \
            --db-subnet-group-description "Subnet group for $PROJECT_NAME database" \
            --subnet-ids $subnets \
            --region $AWS_REGION
    fi
    
    # Create RDS instance
    local db_instance_id="$PROJECT_NAME-postgres"
    if ! aws rds describe-db-instances --db-instance-identifier $db_instance_id --region $AWS_REGION &> /dev/null; then
        log "Creating RDS PostgreSQL instance..."
        
        aws rds create-db-instance \
            --db-instance-identifier $db_instance_id \
            --db-instance-class db.t3.medium \
            --engine postgres \
            --engine-version 15.4 \
            --master-username tradesuser \
            --master-user-password $(openssl rand -base64 32) \
            --allocated-storage 100 \
            --max-allocated-storage 1000 \
            --db-subnet-group-name $subnet_group_name \
            --vpc-security-group-ids $(get_db_security_group) \
            --backup-retention-period 7 \
            --multi-az \
            --storage-encrypted \
            --storage-type gp3 \
            --region $AWS_REGION
        
        log "Waiting for RDS instance to be available..."
        aws rds wait db-instance-available --db-instance-identifier $db_instance_id --region $AWS_REGION
        
        success "RDS instance created and available"
    else
        success "RDS instance already exists"
    fi
    
    # Create ElastiCache Redis cluster
    local cache_cluster_id="$PROJECT_NAME-redis"
    if ! aws elasticache describe-cache-clusters --cache-cluster-id $cache_cluster_id --region $AWS_REGION &> /dev/null; then
        log "Creating ElastiCache Redis cluster..."
        
        aws elasticache create-cache-cluster \
            --cache-cluster-id $cache_cluster_id \
            --cache-node-type cache.t3.micro \
            --engine redis \
            --num-cache-nodes 1 \
            --region $AWS_REGION
        
        success "ElastiCache Redis cluster created"
    else
        success "ElastiCache Redis cluster already exists"
    fi
}

get_db_security_group() {
    # Create or get security group for database
    local sg_name="$PROJECT_NAME-db-sg"
    local vpc_id=$(aws eks describe-cluster --name $EKS_CLUSTER_NAME --region $AWS_REGION --query 'cluster.resourcesVpcConfig.vpcId' --output text)
    
    local sg_id=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=$sg_name" "Name=vpc-id,Values=$vpc_id" \
        --query 'SecurityGroups[0].GroupId' \
        --output text \
        --region $AWS_REGION 2>/dev/null)
    
    if [ "$sg_id" = "None" ] || [ -z "$sg_id" ]; then
        log "Creating database security group..."
        sg_id=$(aws ec2 create-security-group \
            --group-name $sg_name \
            --description "Security group for $PROJECT_NAME database" \
            --vpc-id $vpc_id \
            --region $AWS_REGION \
            --query 'GroupId' \
            --output text)
        
        # Allow inbound traffic from EKS nodes
        aws ec2 authorize-security-group-ingress \
            --group-id $sg_id \
            --protocol tcp \
            --port 5432 \
            --source-group $sg_id \
            --region $AWS_REGION
    fi
    
    echo $sg_id
}

# =================================================================
# APPLICATION BUILD & DEPLOYMENT
# =================================================================

build_and_push_images() {
    log "Building and pushing Docker images..."
    
    # Login to ECR
    aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
    
    # Build backend image
    log "Building backend image..."
    docker build -t $ECR_REGISTRY/$PROJECT_NAME/backend:latest ./backend
    docker push $ECR_REGISTRY/$PROJECT_NAME/backend:latest
    success "Backend image pushed"
    
    # Build admin dashboard image
    log "Building admin dashboard image..."
    docker build -t $ECR_REGISTRY/$PROJECT_NAME/admin-dashboard:latest ./admin-dashboard
    docker push $ECR_REGISTRY/$PROJECT_NAME/admin-dashboard:latest
    success "Admin dashboard image pushed"
    
    success "All images built and pushed"
}

deploy_kubernetes_resources() {
    log "Deploying Kubernetes resources..."
    
    # Create namespace
    kubectl create namespace $PROJECT_NAME --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply secrets (you should create these from external secret management)
    if [ -f "k8s/secrets.yaml" ]; then
        kubectl apply -f k8s/secrets.yaml
    else
        warning "secrets.yaml not found. Please create secrets manually."
    fi
    
    # Apply all Kubernetes manifests
    kubectl apply -f k8s/ --recursive
    
    # Wait for deployments to be ready
    log "Waiting for deployments to be ready..."
    kubectl wait --for=condition=available --timeout=600s deployment/backend-api -n $PROJECT_NAME
    kubectl wait --for=condition=available --timeout=600s deployment/admin-dashboard -n $PROJECT_NAME
    
    success "Kubernetes resources deployed successfully"
}

# =================================================================
# DATABASE MIGRATION
# =================================================================

run_database_migrations() {
    log "Running database migrations..."
    
    # Get backend pod name
    local pod_name=$(kubectl get pods -n $PROJECT_NAME -l app=backend-api -o jsonpath='{.items[0].metadata.name}')
    
    if [ -n "$pod_name" ]; then
        log "Running migrations on pod: $pod_name"
        kubectl exec -n $PROJECT_NAME $pod_name -- npm run db:migrate
        kubectl exec -n $PROJECT_NAME $pod_name -- npm run db:seed
        success "Database migrations completed"
    else
        error "No backend pod found"
    fi
}

# =================================================================
# SSL/TLS SETUP
# =================================================================

setup_ssl_certificates() {
    log "Setting up SSL certificates with cert-manager..."
    
    # Install cert-manager if not already installed
    if ! kubectl get namespace cert-manager &> /dev/null; then
        log "Installing cert-manager..."
        kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.2/cert-manager.yaml
        kubectl wait --for=condition=available --timeout=300s deployment/cert-manager -n cert-manager
    fi
    
    # Create ClusterIssuer for Let's Encrypt
    cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@tradesplatform.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
    
    success "SSL certificates configured"
}

# =================================================================
# MONITORING SETUP
# =================================================================

setup_monitoring() {
    log "Setting up monitoring with Prometheus and Grafana..."
    
    # Add Prometheus Helm repository
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update
    
    # Install Prometheus stack
    if ! helm list -n monitoring | grep -q kube-prometheus-stack; then
        kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
        
        helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
            --namespace monitoring \
            --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
            --set grafana.adminPassword=admin123 \
            --wait
        
        success "Monitoring stack installed"
    else
        success "Monitoring stack already installed"
    fi
}

# =================================================================
# HEALTH CHECKS
# =================================================================

run_health_checks() {
    log "Running health checks..."
    
    # Check API health
    local api_url="https://api.tradesplatform.com/health"
    if curl -f -s $api_url > /dev/null; then
        success "API health check passed"
    else
        warning "API health check failed"
    fi
    
    # Check admin dashboard
    local admin_url="https://admin.tradesplatform.com/health"
    if curl -f -s $admin_url > /dev/null; then
        success "Admin dashboard health check passed"
    else
        warning "Admin dashboard health check failed"
    fi
    
    # Check database connectivity
    local pod_name=$(kubectl get pods -n $PROJECT_NAME -l app=backend-api -o jsonpath='{.items[0].metadata.name}')
    if kubectl exec -n $PROJECT_NAME $pod_name -- npm run health:db; then
        success "Database connectivity check passed"
    else
        warning "Database connectivity check failed"
    fi
    
    success "Health checks completed"
}

# =================================================================
# BACKUP SETUP
# =================================================================

setup_backups() {
    log "Setting up automated backups..."
    
    # Create S3 bucket for backups
    local backup_bucket="$PROJECT_NAME-backups-$(date +%s)"
    if ! aws s3api head-bucket --bucket $backup_bucket 2>/dev/null; then
        aws s3api create-bucket \
            --bucket $backup_bucket \
            --region $AWS_REGION \
            --create-bucket-configuration LocationConstraint=$AWS_REGION
        
        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket $backup_bucket \
            --versioning-configuration Status=Enabled
        
        # Set lifecycle policy
        cat > lifecycle-policy.json <<EOF
{
    "Rules": [
        {
            "ID": "BackupRetention",
            "Status": "Enabled",
            "Transitions": [
                {
                    "Days": 30,
                    "StorageClass": "STANDARD_IA"
                },
                {
                    "Days": 90,
                    "StorageClass": "GLACIER"
                }
            ],
            "Expiration": {
                "Days": 2555
            }
        }
    ]
}
EOF
        
        aws s3api put-bucket-lifecycle-configuration \
            --bucket $backup_bucket \
            --lifecycle-configuration file://lifecycle-policy.json
        
        rm lifecycle-policy.json
        
        success "Backup bucket created: $backup_bucket"
    fi
    
    success "Backup setup completed"
}

# =================================================================
# MAIN DEPLOYMENT FUNCTION
# =================================================================

deploy_full_stack() {
    log "Starting full stack deployment for $PROJECT_NAME..."
    
    check_prerequisites
    setup_infrastructure
    setup_database
    build_and_push_images
    deploy_kubernetes_resources
    run_database_migrations
    setup_ssl_certificates
    setup_monitoring
    setup_backups
    run_health_checks
    
    success "🎉 Full stack deployment completed successfully!"
    
    echo ""
    echo "=== DEPLOYMENT SUMMARY ==="
    echo "API URL: https://api.tradesplatform.com"
    echo "Admin Dashboard: https://admin.tradesplatform.com"
    echo "Grafana: kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80"
    echo "Prometheus: kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090"
    echo ""
    echo "Next steps:"
    echo "1. Configure DNS records for your domains"
    echo "2. Set up external secrets management"
    echo "3. Configure monitoring alerts"
    echo "4. Test end-to-end user workflows"
    echo "5. Begin user onboarding!"
}

# =================================================================
# ROLLBACK FUNCTION
# =================================================================

rollback_deployment() {
    log "Rolling back deployment..."
    
    # Rollback deployments
    kubectl rollout undo deployment/backend-api -n $PROJECT_NAME
    kubectl rollout undo deployment/admin-dashboard -n $PROJECT_NAME
    
    # Wait for rollback to complete
    kubectl rollout status deployment/backend-api -n $PROJECT_NAME
    kubectl rollout status deployment/admin-dashboard -n $PROJECT_NAME
    
    success "Rollback completed"
}

# =================================================================
# QUICK DEPLOYMENT FUNCTIONS
# =================================================================

quick_deploy() {
    log "Running quick deployment (app only)..."
    
    build_and_push_images
    deploy_kubernetes_resources
    run_health_checks
    
    success "Quick deployment completed"
}

# =================================================================
# SCRIPT ENTRY POINT
# =================================================================

case "${1:-full}" in
    "full")
        deploy_full_stack
        ;;
    "quick")
        quick_deploy
        ;;
    "rollback")
        rollback_deployment
        ;;
    "health")
        run_health_checks
        ;;
    "migrations")
        run_database_migrations
        ;;
    *)
        echo "Usage: $0 {full|quick|rollback|health|migrations}"
        echo ""
        echo "Commands:"
        echo "  full       - Complete infrastructure and application deployment"
        echo "  quick      - Application deployment only (assumes infrastructure exists)"
        echo "  rollback   - Rollback to previous deployment"
        echo "  health     - Run health checks"
        echo "  migrations - Run database migrations only"
        exit 1
        ;;
esac