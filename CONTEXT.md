# GuineaPing

Alerts a small group of patients and family members when a clinical trial matching something they care about is first posted on ClinicalTrials.gov.

## Language

### People

**Member**:
A person in the group, allowed in by email address. Every person who uses GuineaPing is a Member. Any Member can invite someone or remove a Member, themselves included; Members can see who the other Members are.
_Avoid_: User, subscriber, account, patient

**Profile**:
A few facts a Member gives about themselves: the year they were born, their sex, a ZIP code and how far they would travel, their conditions, and whether they would join as a healthy volunteer. Only that Member sees it. It fills in new Watches for them and is where "near you" is measured from when a Watch has no ZIP code.
_Avoid_: Account, settings, preferences

**Device**:
A phone or browser on which a Member has allowed GuineaPing to send push notifications. A Member may have several Devices, or none.
_Avoid_: Subscription, endpoint, client

### Trials and Watches

**Trial**:
One study registered on ClinicalTrials.gov, identified by its NCT ID.
_Avoid_: Study, listing, record

**Watch**:
A named set of search criteria (conditions, keywords, distance from a ZIP code, phases, statuses, age, sex, healthy volunteers) that Trials are matched against. Every Member can see and follow any Watch that is not a Private watch; only its Owner can change or delete it. Who follows a Watch is never shown.
_Avoid_: Search, filter, query, subscription, saved search

**Private watch**:
A Watch that only its Owner can see or follow.
_Avoid_: Hidden watch, personal watch, secret watch

**Owner**:
The one Member who may edit or delete a Watch: its creator, until they leave the group, when ownership passes to the Watch's longest-standing follower (a Watch with no followers is deleted).
_Avoid_: Creator, admin, author

**Follow**:
A Member's choice to receive Alerts for a Watch, starting from the moment they follow it. A Follow ends when the Member unfollows, or when the Watch is deleted or made private; the Member is told once, in their Alert list.
_Avoid_: Subscribe, join, watch (as a verb)

**Check**:
One hourly look at ClinicalTrials.gov, Watch by Watch, for Trials first posted since each Watch was last checked successfully. A Watch that can't be checked leaves no gap: it catches up the next time it can, without holding back the others. A Check fails only when no Watch could be checked.
_Avoid_: Poll, run, sync, scan

**New trial**:
For a given Member and Watch: a Trial that a Check finds matching the Watch for the first time after the Member started following it, and that the Member has never been alerted on. Trials already among the Watch's Recent matches when it was created or its criteria changed are not new. A status change or added site does not make a Trial new; it may cause an Update.
_Avoid_: Fresh trial, update

**Recent match**:
A Trial matching a Watch that was first posted in the 30 days before now. Shown on the Watch's page; never causes an Alert by itself.
_Avoid_: Backlog, history, results

### Alerts

**Alert**:
One notice to one Member about one Trial: a New trial, naming every Watch they follow that it matches, or a Trial another Member sent them. A Member never gets two Alerts for the same Trial; it is pushed to all their Devices and kept in their Alert list. A Member can mark an Alert "Interested" or "Not for me" and keep a note on it; only they see either.
_Avoid_: Ping, notification, message

**Update**:
News about a Trial a Member already has an Alert for: it has started recruiting, or added a site within the distance of a Watch of theirs that found it. The Alert turns unread and says what changed; it is still the one Alert for that Trial. Alerts marked "Not for me" get no Updates.
_Avoid_: Change alert, second Alert, re-alert

**Push**:
What appears on a Member's Devices when Alerts are created or get an Update. A Push carries a single Alert, or, when a Member has more than three Alerts waiting, one Push summarises them all and opens the Alert list. A Push that reaches none of a Member's Devices is tried again with each Check for a day.
_Avoid_: Notification, ping, Alert (an Alert is the record; a Push is how it is announced)

**Alert list**:
Every Alert a Member has received, newest first, each marked read or unread. The record of truth when a push is missed or a Member has no Device.
_Avoid_: Inbox, feed, history, notifications
