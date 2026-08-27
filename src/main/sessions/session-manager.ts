import { session, type Session } from "electron";
export class SessionManager {
  constructor(private readonly partition = "persist:default") {}
  getSession(): Session {
    return session.fromPartition(this.partition);
  }
}
