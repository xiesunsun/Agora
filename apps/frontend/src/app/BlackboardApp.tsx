import { BlackboardPage } from "../components/BlackboardPage";
import { useSessionStore } from "./sessionStore";

export function BlackboardApp() {
  const session = useSessionStore();

  return <BlackboardPage session={session} />;
}
