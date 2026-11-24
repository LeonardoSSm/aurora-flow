import { AdminFeatureCard } from '../components/admin-feature-card';
import { useAdminOverview } from '../hooks/use-admin-overview';

export function AdminView() {
  const { features } = useAdminOverview();

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
      {features.map((feature) => (
        <AdminFeatureCard
          key={feature.title}
          title={feature.title}
          description={feature.description}
          status={feature.status}
          href={feature.href}
          icon={feature.icon}
        />
      ))}
    </div>
  );
}
