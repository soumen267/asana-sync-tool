import { detectPriority } from "../../../services/aiPriority";

export async function GET() {

  const result =
    await detectPriority({
      name:
        "Stripe checkout broken for UK customers",
      notes:
        "Customers unable to complete payment flow.",
    });

  console.log("FINAL AI RESULT:", result);

  return Response.json(result);

}