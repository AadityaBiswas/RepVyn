// The reminder notification. One plain, steady line (DESIGN.md "Brand and voice": no guilt, no exclamation marks).
export function reminderMessage(): { title: string; body: string; url: string; tag: string } {
  return { title: "RepVyn", body: "Today's workout is ready when you are.", url: "/", tag: "daily-reminder" };
}
