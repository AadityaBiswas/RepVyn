// Daily workout reminders as local notifications.
// One dated notification per day at the chosen time, today's left out once trained; redone on every launch,
// change of setting and new day, so the run never runs dry while the app is in use.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { addDays } from "../../shared/model";
import { reminderTime } from "../../shared/syncCore";

const DAYS = 30; // ponytail: after a month without opening the app the reminders stop; a DAILY trigger would keep them, but can't skip trained days.
const BODY = "Today's workout is ready when you are."; // same line as supabase/functions/_shared/reminders.ts

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

let queue = Promise.resolve();

/** Replaces every scheduled reminder for `remind` ("6:30 pm" or "Off"). Asks for permission the first time. */
export function scheduleReminders(remind: string, trainedToday: boolean, now = Date.now()) {
  queue = queue.then(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const hm = reminderTime(remind);
    if (!hm || Platform.OS === "web") return;
    // Android 13+ only shows the permission prompt once a channel exists.
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("reminders", { name: "Reminders", importance: Notifications.AndroidImportance.DEFAULT });
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && (!perm.canAskAgain || !(await Notifications.requestPermissionsAsync()).granted)) return;
    const [h, m] = hm.split(":").map(Number) as [number, number];
    for (let i = trainedToday ? 1 : 0; i < DAYS; i++) {
      const at = new Date(addDays(now, i)).setHours(h, m); // setHours, not added ms, so DST days keep the time
      if (at <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: "RepVyn", body: BODY },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: "reminders" },
      });
    }
  }).catch(() => {});
}
