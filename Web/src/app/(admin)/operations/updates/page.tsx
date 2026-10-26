import PageHeader from "@/components/PageHeader";
import { backendQuery } from "@/lib/backendApi";
import { canSendUpdates } from "@/lib/roles";
import { fetchPortalProfile } from "@/lib/portalRole";
import UpdatesDesk from "./UpdatesDesk";
import type { SentUpdate } from "./types";

export default async function OperationsUpdatesPage() {
  const profile = await fetchPortalProfile();
  const canSend = profile ? canSendUpdates(profile.role) : false;
  const sent = canSend
    ? await backendQuery<SentUpdate[]>("/updates/sent")
    : { data: [] as SentUpdate[], error: null };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Updates"
        description="Write a message and send it to everyone, one role, or one person. It shows in the bell on this portal and as an alert in the field app."
      />
      <UpdatesDesk canSend={canSend} sent={sent.data ?? []} loadError={sent.error} />
    </div>
  );
}
