# GuineaPing

Alerts a small group of people, mostly healthy volunteers, when a clinical trial they could take part in is first posted on ClinicalTrials.gov. Some Members also watch for trials about a condition they or their family have.

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
One study registered on ClinicalTrials.gov, identified by its NCT ID. Every Trial has a kind: either it only observes the people in it, or it tests something on them, such as a drug, a device, a supplement or a behavioural programme, and it may test more than one.
_Avoid_: Study, listing, record

**Watch**:
A named set of search criteria (conditions, keywords, distance from a ZIP code, Clinics, kinds of study, phases, statuses, age, sex, healthy volunteers) that Trials are matched against. A Watch that names Clinics matches only Trials with a site at one of them. Every Member can see and follow any Watch that is not a Private watch; only its Owner can change or delete it. Who follows a Watch is never shown.
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

**Past study**:
A study a Member took part in, as they wrote it down: the day it ended, the day of their last dose if they know it, and how many days they must wait. Only that Member sees it.
_Avoid_: Participation, enrolment, history

**Waiting period**:
The days a Member waits after a Past study before joining another: from the later of the day it ended and the day of the last dose, 30 days unless the Member says otherwise. It is the Member's own reminder, worked out from what they typed. GuineaPing checks no registry, and each study sets its own rule. When it ends the Member is told once, in their Alert list.
_Avoid_: Washout (the clinics' word; say it once when explaining), cooldown, lockout

### Clinics

**Clinic**:
A research unit that pays healthy volunteers and advertises its studies on its own website, such as Celerion in Lincoln or Fortrea in Madison. GuineaPing keeps the list of Clinics by hand: name, city, and a link to the Clinic’s own list of studies. Every Member sees the same Clinics, nearest first when their Profile has a ZIP code. A Trial is at a Clinic when its listing names a site by one of the names the Clinic goes by, in the Clinic’s city; a Trial that names no site is not tied to any Clinic.
_Avoid_: Site (a site is one place a Trial runs), facility, CRO, unit

**Opening**:
One entry on a Clinic’s own list of studies, shown in the Clinic’s own words: what it pays, when, how long the stay is, and who it is for. An Opening is not a Trial and is not tied to one, because Clinics give no NCT ID. It links to its page on the Clinic’s site.
_Avoid_: Study, listing, Trial, posting

**Clinic read**:
One look at a Clinic’s list, at most once a day, that records which Openings are there now. Only some Clinics are read. A Clinic whose terms forbid automated tools, or whose site turns them away, is never visited: Members open its list themselves.
_Avoid_: Scrape, crawl, Check (a Check is of ClinicalTrials.gov)
