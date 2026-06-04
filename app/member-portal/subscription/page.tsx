import { redirect } from "next/navigation";

// Return URL target for Stripe Customer Portal — bounces the user back
// to the portal with the Subscription tab pre-selected.
export default function SubscriptionReturn() {
  redirect("/member-portal?tab=subscription");
}
