interface BadgeProps {
  status: 'received' | 'processing' | 'approved' | 'paid' | 'rejected';
}

const config = {
  received: { label: 'Received', className: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Processing', className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700' },
  paid: { label: 'Paid', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
};

export default function Badge({ status }: BadgeProps) {
  const { label, className } = config[status] || config.received;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
