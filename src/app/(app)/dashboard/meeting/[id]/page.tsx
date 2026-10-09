import MeetingDetailClient from './meeting-detail-client';

export function generateStaticParams() {
  return [
    { id: 'view' },
    { id: 'default' },
  ];
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  return <MeetingDetailClient id={resolvedParams?.id} />;
}
