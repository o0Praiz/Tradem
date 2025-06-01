#!/bin/bash
# deploy-production.sh - Production Deployment Script

set -e

echo "🚀 Starting Advanced Trades Platform Deployment..."

# Configuration
CLUSTER_NAME="trades-platform-cluster"
NAMESPACE="trades-platform"
REGION="us-east-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check environment variables
    required_vars=("AWS_ACCESS_KEY_ID" "AWS_SECRET_ACCESS_KEY" "STRIPE_SECRET_KEY" "JWT_SECRET")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            log_error "Environment variable $var is not set"
            exit 1
        fi
    done
    
    log_info "Prerequisites check passed ✅"
}

# Configure AWS and Kubernetes
configure_environment() {
    log_info "Configuring environment..."
    
    # Configure kubectl for EKS
    aws eks update-kubeconfig --region $REGION --name $CLUSTER_NAME
    
    # Verify cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_info "Environment configured ✅"
}

# Build and push Docker images
build_and_push_images() {
    log_info "Building and pushing Docker images..."
    
    # Get ECR login token
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.$REGION.amazonaws.com
    
    # Build backend image
    log_info "Building backend image..."
    docker build -t trades-platform/backend:latest ./backend/
    docker tag trades-platform/backend:latest $(aws sts get-caller-identity --query Account --output text).dkr.ecr.$REGION.amazonaws.com/trades-platform-backend:latest
    docker push $(aws sts get-caller-identity --query Account --output text).dkr.ecr.$REGION.amazonaws.com/trades-platform-backend:latest
    
    # Build admin dashboard image
    log_info "Building admin dashboard image..."
    docker build -t trades-platform/admin:latest ./admin-dashboard/
    docker tag trades-platform/admin:latest $(aws sts get-caller-identity --query Account --output text).dkr.ecr.$REGION.amazonaws.com/trades-platform-admin:latest
    docker push $(aws sts get-caller-identity --query Account --output text).dkr.ecr.$REGION.amazonaws.com/trades-platform-admin:latest
    
    log_info "Docker images built and pushed ✅"
}

# Create namespace and secrets
setup_namespace_and_secrets() {
    log_info "Setting up namespace and secrets..."
    
    # Create namespace if it doesn't exist
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    # Create secrets
    kubectl create secret generic app-secrets \
        --namespace=$NAMESPACE \
        --from-literal=jwt-secret="$JWT_SECRET" \
        --from-literal=stripe-secret="$STRIPE_SECRET_KEY" \
        --from-literal=postgres-password="$POSTGRES_PASSWORD" \
        --from-literal=redis-password="$REDIS_PASSWORD" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    log_info "Namespace and secrets configured ✅"
}

# Deploy database
deploy_database() {
    log_info "Deploying database..."
    
    # Apply PostgreSQL deployment
    kubectl apply -f k8s/databases/postgres.yaml -n $NAMESPACE
    
    # Wait for PostgreSQL to be ready
    kubectl wait --for=condition=ready pod -l app=postgres -n $NAMESPACE --timeout=300s
    
    # Apply Redis deployment
    kubectl apply -f k8s/databases/redis.yaml -n $NAMESPACE
    
    # Wait for Redis to be ready
    kubectl wait --for=condition=ready pod -l app=redis -n $NAMESPACE --timeout=300s
    
    log_info "Database deployed ✅"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Create a temporary pod to run migrations
    kubectl run migration-job \
        --image=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$REGION.amazonaws.com/trades-platform-backend:latest \
        --namespace=$NAMESPACE \
        --rm -it --restart=Never \
        --command -- npm run migrate
    
    log_info "Database migrations completed ✅"
}

# Deploy applications
deploy_applications() {
    log_info "Deploying applications..."
    
    # Apply backend deployment
    kubectl apply -f k8s/applications/backend-api.yaml -n $NAMESPACE
    
    # Apply admin dashboard deployment
    kubectl apply -f k8s/applications/admin-dashboard.yaml -n $NAMESPACE
    
    # Apply services
    kubectl apply -f k8s/services/ -n $NAMESPACE
    
    # Apply ingress
    kubectl apply -f k8s/ingress/trades-platform-ingress.yaml -n $NAMESPACE
    
    log_info "Applications deployed ✅"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Wait for deployments to be ready
    kubectl wait --for=condition=available deployment/backend-api -n $NAMESPACE --timeout=300s
    kubectl wait --for=condition=available deployment/admin-dashboard -n $NAMESPACE --timeout=300s
    
    # Check pod status
    kubectl get pods -n $NAMESPACE
    
    # Check services
    kubectl get services -n $NAMESPACE
    
    # Check ingress
    kubectl get ingress -n $NAMESPACE
    
    # Health check
    log_info "Running health checks..."
    
    # Get the load balancer URL
    LB_URL=$(kubectl get ingress trades-platform-ingress -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    
    if [[ -n "$LB_URL" ]]; then
        log_info "Load Balancer URL: https://$LB_URL"
        
        # Test API health endpoint
        if curl -f "https://$LB_URL/api/v1/health" > /dev/null 2>&1; then
            log_info "API health check passed ✅"
        else
            log_warn "API health check failed ⚠️"
        fi
    else
        log_warn "Load Balancer URL not yet available ⚠️"
    fi
    
    log_info "Deployment verification completed ✅"
}

# Setup monitoring
setup_monitoring() {
    log_info "Setting up monitoring..."
    
    # Apply monitoring configurations
    kubectl apply -f k8s/monitoring/ -n $NAMESPACE
    
    log_info "Monitoring setup completed ✅"
}

# Main deployment flow
main() {
    log_info "🚀 Advanced Trades Platform Production Deployment"
    log_info "================================================"
    
    check_prerequisites
    configure_environment
    build_and_push_images
    setup_namespace_and_secrets
    deploy_database
    run_migrations
    deploy_applications
    verify_deployment
    setup_monitoring
    
    log_info "🎉 Deployment completed successfully!"
    log_info "Your platform is now running in production."
    log_info ""
    log_info "Next steps:"
    log_info "1. Configure DNS to point to the load balancer"
    log_info "2. Set up SSL certificates"
    log_info "3. Configure monitoring alerts"
    log_info "4. Run integration tests"
    log_info "5. Begin user onboarding"
}

# Run deployment
main "$@"