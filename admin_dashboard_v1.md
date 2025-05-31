# Admin Dashboard Web Application - admin_dashboard_v1

**Module ID**: admin_dashboard_v1  
**Version**: 1.0.0  
**Dependencies**: ui_design_system_v1, auth_strategy_v1, api_specification_v1, payment_processing_v1, messaging_system_v1  
**Provides**: Complete web-based admin interface for platform management  
**Integration Points**: Backend API, analytics services, payment processing, user management  
**Last Updated**: 2025-05-31

## Dashboard Architecture Overview

### Technology Stack
- **Framework**: React 18 with TypeScript
- **State Management**: Redux Toolkit with RTK Query
- **UI Components**: Material-UI (MUI) with custom theme
- **Charts & Analytics**: Recharts and Chart.js
- **Data Grid**: MUI DataGrid Pro for large datasets
- **Real-time Updates**: Socket.IO client for live data
- **Build Tool**: Vite for fast development and builds
- **Testing**: Jest + React Testing Library

### Application Structure
```
AdminDashboard/
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── common/          # Generic components
│   │   ├── charts/          # Analytics charts
│   │   └── forms/           # Form components
│   ├── pages/               # Page components
│   │   ├── dashboard/       # Main dashboard
│   │   ├── users/           # User management
│   │   ├── jobs/            # Job management
│   │   ├── payments/        # Payment management
│   │   ├── analytics/       # Analytics & reports
│   │   └── settings/        # Platform settings
│   ├── hooks/               # Custom React hooks
│   ├── services/            # API services
│   ├── store/               # Redux store
│   ├── utils/               # Helper functions
│   └── types/               # TypeScript definitions
├── public/                  # Static assets
└── __tests__/              # Test files
```

## Core Dashboard Features

### 1. Executive Dashboard Overview
```
┌─────────────────────────────────────────────────────────────┐
│ [🏠] Trades Platform Admin    [🔔] [👤] Admin User  [⚙️]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 📊 Key Metrics (Last 30 Days)                              │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
│ │ 📈 Revenue  │ │ 👥 Users    │ │ 🔧 Jobs     │ │ ⭐ Rating│ │
│ │ $47,829     │ │ 1,247 (+12%)│ │ 892 (+8%)   │ │ 4.9/5.0 │ │
│ │ +15% ↗️     │ │ 234 New     │ │ 156 Active  │ │ 👍 98%  │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
│                                                             │
│ 📈 Revenue Trend                    🗺️ Geographic Activity  │
│ ┌─────────────────────────────┐     ┌─────────────────────┐ │
│ │ [Line chart showing         │     │ [Interactive map    │ │
│ │  revenue over time]         │     │  showing user       │ │
│ │                             │     │  activity by state] │ │
│ └─────────────────────────────┘     └─────────────────────┘ │
│                                                             │
│ 🚨 Recent Alerts               📋 Quick Actions             │
│ • 3 pending contractor reviews  ┌─────────────────────────┐ │
│ • Payment dispute: Job #4829   │ [New User] [Export Data]│ │
│ • System maintenance due        │ [Send Notice] [Reports] │ │
│                                └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2. User Management Interface
```
┌─────────────────────────────────────────────────────────────┐
│ Users Management                            [+ Add User]    │
├─────────────────────────────────────────────────────────────┤
│ 🔍 Search: [________________] 🏷️ Filter: [All Users ▼]      │
│                                                             │
│ ┌─ User List ──────────────────────────────────────────────┐ │
│ │ ID   │ Name           │ Type       │ Status │ Joined     │ │
│ ├──────┼────────────────┼────────────┼────────┼────────────┤ │
│ │ 1001 │ John Smith     │ Customer   │ Active │ 2024-01-15 │ │
│ │      │ john@email.com │            │ ✅     │ [Edit]     │ │
│ ├──────┼────────────────┼────────────┼────────┼────────────┤ │
│ │ 1002 │ Mike Johnson   │ Contractor │ Active │ 2024-01-12 │ │
│ │      │ mike@trade.com │ Plumber    │ ✅     │ [Edit]     │ │
│ ├──────┼────────────────┼────────────┼────────┼────────────┤ │
│ │ 1003 │ Sarah Wilson   │ Customer   │ Pending│ 2024-01-20 │ │
│ │      │ sarah@mail.com │            │ ⏳     │ [Edit]     │ │
│ └──────┴────────────────┴────────────┴────────┴────────────┘ │
│                                                             │
│ Pagination: [‹ Prev] [1] [2] [3] [4] [5] [Next ›]         │
└─────────────────────────────────────────────────────────────┘
```

### 3. Job Management Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│ Jobs Management                             [Export Jobs]   │
├─────────────────────────────────────────────────────────────┤
│ Status Overview:                                            │
│ [🟢 Active: 156] [🟡 Pending: 89] [✅ Completed: 647]     │
│ [🔴 Disputed: 3] [❌ Cancelled: 47]                       │
│                                                             │
│ 🔍 Quick Filters:                                          │
│ [Today's Jobs] [Urgent] [Disputed] [High Value] [All]     │
│                                                             │
│ ┌─ Job Details ───────────────────────────────────────────┐ │
│ │ #4832 │ Kitchen Sink Repair    │ 🔧 Plumbing │ $120     │ │
│ │       │ Sarah J. → Mike T.     │ ⏰ Today 2PM│ Active   │ │
│ │       │ 📍 123 Oak St, Des Moines│           │ [View]   │ │
│ ├───────┼────────────────────────┼─────────────┼─────────┤ │
│ │ #4831 │ HVAC System Check     │ ❄️ HVAC     │ $250     │ │
│ │       │ Tom R. → Lisa K.      │ ⏰ Tomorrow │ Pending  │ │
│ │       │ 📍 456 Elm Ave, Ankeny│             │ [View]   │ │
│ └───────┴────────────────────────┴─────────────┴─────────┘ │
│                                                             │
│ 🚨 Attention Required:                                     │
│ • Job #4829: Payment dispute (Customer vs Contractor)      │
│ • Job #4825: Overdue completion (Started 3 days ago)      │
│ • Job #4820: Customer complaint about quality             │
└─────────────────────────────────────────────────────────────┘
```

## Component Specifications

### Navigation and Layout

#### Main Navigation Sidebar
```typescript
interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  badge?: number;
  children?: NavigationItem[];
}

const navigationItems: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    path: '/admin/dashboard'
  },
  {
    id: 'users',
    label: 'Users',
    icon: 'people',
    path: '/admin/users',
    children: [
      { id: 'customers', label: 'Customers', icon: 'person', path: '/admin/users/customers' },
      { id: 'contractors', label: 'Contractors', icon: 'engineering', path: '/admin/users/contractors' }
    ]
  },
  {
    id: 'jobs',
    label: 'Jobs',
    icon: 'work',
    path: '/admin/jobs',
    badge: 12 // Urgent jobs count
  },
  {
    id: 'payments',
    label: 'Payments',
    icon: 'payment',
    path: '/admin/payments'
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'analytics',
    path: '/admin/analytics'
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    path: '/admin/settings'
  }
];
```

#### Dashboard Header Component
```typescript
interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumbs?: string[];
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title, subtitle, actions, breadcrumbs
}) => {
  return (
    <Box sx={{ mb: 3 }}>
      {breadcrumbs && (
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1 }}>
          {breadcrumbs.map((crumb, index) => (
            <Typography key={index} color={index === breadcrumbs.length - 1 ? 'primary' : 'text.primary'}>
              {crumb}
            </Typography>
          ))}
        </Breadcrumbs>
      )}
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body1" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        
        {actions && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            {actions}
          </Box>
        )}
      </Box>
    </Box>
  );
};
```

### Analytics and Charts

#### Revenue Chart Component
```typescript
interface RevenueChartProps {
  data: Array<{
    date: string;
    revenue: number;
    jobs: number;
  }>;
  period: 'week' | 'month' | 'quarter' | 'year';
}

const RevenueChart: React.FC<RevenueChartProps> = ({ data, period }) => {
  return (
    <Card>
      <CardHeader
        title="Revenue Trend"
        action={
          <Select value={period} size="small">
            <MenuItem value="week">Last Week</MenuItem>
            <MenuItem value="month">Last Month</MenuItem>
            <MenuItem value="quarter">Last Quarter</MenuItem>
            <MenuItem value="year">Last Year</MenuItem>
          </Select>
        }
      />
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip formatter={(value, name) => [
              name === 'revenue' ? `$${value}` : value,
              name === 'revenue' ? 'Revenue' : 'Jobs'
            ]} />
            <Line type="monotone" dataKey="revenue" stroke="#2196f3" strokeWidth={2} />
            <Line type="monotone" dataKey="jobs" stroke="#ff9800" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
```

#### KPI Cards Component
```typescript
interface KPICardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    period: string;
    positive: boolean;
  };
  icon: React.ReactNode;
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
}

const KPICard: React.FC<KPICardProps> = ({ 
  title, value, change, icon, color = 'primary' 
}) => {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Avatar sx={{ bgcolor: `${color}.main`, mr: 2 }}>
            {icon}
          </Avatar>
          <Typography variant="h6" component="div">
            {title}
          </Typography>
        </Box>
        
        <Typography variant="h4" component="div" sx={{ mb: 1 }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </Typography>
        
        {change && (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <TrendingUpIcon 
              color={change.positive ? 'success' : 'error'}
              sx={{ mr: 0.5, transform: change.positive ? 'none' : 'rotate(180deg)' }}
            />
            <Typography 
              variant="body2" 
              color={change.positive ? 'success.main' : 'error.main'}
            >
              {change.positive ? '+' : ''}{change.value}% {change.period}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
```

### Data Management Components

#### Advanced Data Grid
```typescript
interface AdminDataGridProps<T> {
  data: T[];
  columns: GridColDef[];
  loading?: boolean;
  error?: string;
  onRowClick?: (row: T) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  actions?: {
    label: string;
    icon: React.ReactNode;
    onClick: (selectedRows: T[]) => void;
    disabled?: boolean;
  }[];
}

const AdminDataGrid = <T extends { id: string }>({
  data, columns, loading, error, onRowClick, onSelectionChange, actions
}: AdminDataGridProps<T>) => {
  const [selectionModel, setSelectionModel] = useState<string[]>([]);

  return (
    <Card>
      {actions && actions.length > 0 && (
        <CardHeader
          action={
            <Box sx={{ display: 'flex', gap: 1 }}>
              {actions.map((action, index) => (
                <Button
                  key={index}
                  variant="outlined"
                  startIcon={action.icon}
                  disabled={action.disabled || selectionModel.length === 0}
                  onClick={() => {
                    const selectedRows = data.filter(row => 
                      selectionModel.includes(row.id)
                    );
                    action.onClick(selectedRows);
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </Box>
          }
        />
      )}
      
      <CardContent sx={{ p: 0 }}>
        <DataGridPro
          rows={data}
          columns={columns}
          loading={loading}
          error={error}
          checkboxSelection
          selectionModel={selectionModel}
          onSelectionModelChange={setSelectionModel}
          onRowClick={onRowClick ? (params) => onRowClick(params.row) : undefined}
          autoHeight
          disableSelectionOnClick
          rowsPerPageOptions={[25, 50, 100]}
          initialState={{
            pagination: { pageSize: 25 }
          }}
        />
      </CardContent>
    </Card>
  );
};
```

### User Management Features

#### User Detail Modal
```typescript
interface UserDetailModalProps {
  user: User | null;
  open: boolean;
  onClose: () => void;
  onSave: (user: User) => Promise<void>;
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({
  user, open, onClose, onSave
}) => {
  const [formData, setFormData] = useState<Partial<User>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData(user);
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await onSave({ ...user, ...formData });
      onClose();
    } catch (error) {
      console.error('Save user error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {user ? `Edit User: ${user.firstName} ${user.lastName}` : 'Add New User'}
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <TextField
            label="First Name"
            value={formData.firstName || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
            fullWidth
          />
          
          <TextField
            label="Last Name"
            value={formData.lastName || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
            fullWidth
          />
          
          <TextField
            label="Email"
            type="email"
            value={formData.email || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            fullWidth
          />
          
          <TextField
            label="Phone"
            value={formData.phone || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            fullWidth
          />
          
          <FormControl fullWidth>
            <InputLabel>User Type</InputLabel>
            <Select
              value={formData.userType || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, userType: e.target.value }))}
            >
              <MenuItem value="customer">Customer</MenuItem>
              <MenuItem value="contractor">Contractor</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
          
          <FormControl fullWidth>
            <InputLabel>Account Status</InputLabel>
            <Select
              value={formData.accountStatus || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, accountStatus: e.target.value }))}
            >
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="suspended">Suspended</MenuItem>
              <MenuItem value="deactivated">Deactivated</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
```

## Real-time Features

### Live Dashboard Updates
```typescript
const useLiveDashboard = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io('/admin', {
      auth: {
        token: localStorage.getItem('adminToken')
      }
    });

    newSocket.on('metrics_update', (data: DashboardMetrics) => {
      setMetrics(data);
    });

    newSocket.on('user_activity', (activity: UserActivity) => {
      // Update real-time user activity
    });

    newSocket.on('job_status_change', (jobUpdate: JobUpdate) => {
      // Update job status in real-time
    });

    newSocket.on('payment_notification', (payment: PaymentNotification) => {
      // Show payment notifications
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  return { metrics, socket };
};
```

## Security and Access Control

### Role-Based Access Control
```typescript
interface AdminPermission {
  resource: 'users' | 'jobs' | 'payments' | 'analytics' | 'settings';
  actions: ('read' | 'write' | 'delete')[];
}

interface AdminRole {
  id: string;
  name: string;
  permissions: AdminPermission[];
}

const adminRoles: AdminRole[] = [
  {
    id: 'super_admin',
    name: 'Super Administrator',
    permissions: [
      { resource: 'users', actions: ['read', 'write', 'delete'] },
      { resource: 'jobs', actions: ['read', 'write', 'delete'] },
      { resource: 'payments', actions: ['read', 'write', 'delete'] },
      { resource: 'analytics', actions: ['read'] },
      { resource: 'settings', actions: ['read', 'write', 'delete'] }
    ]
  },
  {
    id: 'operations_manager',
    name: 'Operations Manager',
    permissions: [
      { resource: 'users', actions: ['read', 'write'] },
      { resource: 'jobs', actions: ['read', 'write'] },
      { resource: 'payments', actions: ['read'] },
      { resource: 'analytics', actions: ['read'] }
    ]
  },
  {
    id: 'support_agent',
    name: 'Support Agent',
    permissions: [
      { resource: 'users', actions: ['read'] },
      { resource: 'jobs', actions: ['read', 'write'] },
      { resource: 'payments', actions: ['read'] },
      { resource: 'analytics', actions: ['read'] }
    ]
  }
];

const usePermissions = () => {
  const { user } = useAuth();
  
  const hasPermission = (resource: string, action: string) => {
    if (!user?.role) return false;
    
    const role = adminRoles.find(r => r.id === user.role);
    if (!role) return false;
    
    const permission = role.permissions.find(p => p.resource === resource);
    return permission?.actions.includes(action as any) || false;
  };

  return { hasPermission };
};
```

## Analytics and Reporting

### Business Intelligence Dashboard
```typescript
interface AnalyticsData {
  revenue: {
    total: number;
    growth: number;
    byPeriod: Array<{ period: string; amount: number }>;
  };
  users: {
    total: number;
    customers: number;
    contractors: number;
    growth: number;
  };
  jobs: {
    total: number;
    completed: number;
    active: number;
    averageValue: number;
  };
  performance: {
    customerSatisfaction: number;
    contractorRating: number;
    completionRate: number;
    responseTime: number;
  };
}

const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyticsData(period).then(setData).finally(() => setLoading(false));
  }, [period]);

  if (loading) return <LoadingSpinner />;
  if (!data) return <ErrorMessage />;

  return (
    <Grid container spacing={3}>
      {/* KPI Cards */}
      <Grid item xs={12}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <KPICard
              title="Total Revenue"
              value={`$${data.revenue.total.toLocaleString()}`}
              change={{ value: data.revenue.growth, period: 'vs last month', positive: data.revenue.growth > 0 }}
              icon={<AttachMoneyIcon />}
              color="success"
            />
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <KPICard
              title="Total Users"
              value={data.users.total}
              change={{ value: data.users.growth, period: 'vs last month', positive: data.users.growth > 0 }}
              icon={<PeopleIcon />}
              color="primary"
            />
          </Grid>
          
          {/* More KPI cards... */}
        </Grid>
      </Grid>
      
      {/* Charts */}
      <Grid item xs={12} lg={8}>
        <RevenueChart data={data.revenue.byPeriod} period={period} />
      </Grid>
      
      <Grid item xs={12} lg={4}>
        <UserDistributionChart 
          customers={data.users.customers}
          contractors={data.users.contractors}
        />
      </Grid>
    </Grid>
  );
};
```

## Deployment Configuration

### Production Build Setup
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@mui/material', '@mui/icons-material'],
          charts: ['recharts', 'chart.js'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

### Environment Configuration
```typescript
// src/config/env.ts
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  wsUrl: import.meta.env.VITE_WS_URL || 'http://localhost:3000',
  stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
  environment: import.meta.env.MODE,
  
  features: {
    realTimeUpdates: import.meta.env.VITE_ENABLE_REAL_TIME === 'true',
    advancedAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
    exportFeatures: import.meta.env.VITE_ENABLE_EXPORTS === 'true',
  },
};
```

---

## Integration Points

**Backend API**: Complete integration with all core API endpoints
**Real-time Updates**: WebSocket connection for live dashboard updates
**Payment Processing**: Stripe dashboard integration for financial management
**User Management**: Full CRUD operations for all user types
**Job Lifecycle**: Complete job management from creation to completion
**Analytics**: Business intelligence and reporting capabilities

**Next Phase**: Implementation of React components and API integration
**Testing Strategy**: Comprehensive unit tests, integration tests, and E2E testing with Cypress