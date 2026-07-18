import { redirect } from "next/navigation";

export default function LegacyIntentsRedirect() {
  redirect("/operations/intents");
}
