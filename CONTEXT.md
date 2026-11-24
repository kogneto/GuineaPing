# GuineaPing

Alerts a small group of people, mostly healthy volunteers, when a clinical trial they could take part in is first posted on ClinicalTrials.gov. Some Members also watch for trials about a condition they or their family have.

## Language

### People

**Member**:
A person in the group, allowed in by email address. Every person who uses GuineaPing is a Member. Any Member can leave. Only the Organiser can invite someone, remove a Member, or see who the other Members are.
_Avoid_: User, subscriber, account, patient

**Profile**:
A few facts a Member gives about themselves: the year they were born, their sex, a ZIP code and how far they would travel, their conditions, whether they would join as a healthy volunteer, their height and weight, whether they use nicotine, and the day of their last blood or plasma donation. Every fact is optional. Only that Member sees it. It fills in new Watches for them, is where "near you" is measured from when a Watch has no ZIP code, and supplies the facts shown at Points to check. BMI is worked out from height and weight, never given. A donation is a fact here, not a Past study, and has no Waiting period.
_Avoid_: Account, settings (Settings is a page; the Profile is one of the things reached from it), preferences

**Past study**:
A study a Member took part in, as they wrote it down: the day it ended, the day of their last dose if they know it, and how many days they must wait. Only that Member sees it.
_Avoid_: Participation, enrolment, history

**Waiting period**:
The days a Member waits after a Past study before joining another: from the later of the day it ended and the day of the last dose, 30 days unless the Member says otherwise. It is the Member's own reminder, worked out from what they typed. GuineaPing checks no registry, and each study sets its own rule. When it ends the Member is told once: a line in their Alert list, and a Push that says only that there is a note to read.
_Avoid_: Washout (the clinics' word; say it once when explaining), cooldown, lockout

**Device**:
A phone or browser on which a Member has allowed GuineaPing to send push notifications. A Member may have several Devices, or none.
_Avoid_: Subscription, endpoint, client

### Trials and Watches

**Trial**:
One study registered on ClinicalTrials.gov, identified by its NCT ID. Every Trial has a kind: either it only observes the people in it, or it tests something on them, such as a drug, a device, a supplement or a behavioural programme, and it may test more than one.
_Avoid_: Study, listing, record

**Entry criteria**:
A Trial's own rules for who can join, in the Trial's own words, which GuineaPing never rewrites. Only the study team can say whether someone meets them.
_Avoid_: Eligibility, requirements, criteria on its own (a Watch has Search criteria)

**Point to check**:
A line of a Trial's Entry criteria that mentions something a Member's Profile can hold a fact about, such as BMI, weight, nicotine, a recent donation or a recent study. It is shown first, with the Member's own fact beside it, or an invitation to add the fact when the Profile has none. It never says whether the Member can join: the Member compares the two. It always uses the Profile as it is now, and only that Member sees it, also on an Alert another Member sent. Lists show how many Points to check a Trial has, never what they say.
_Avoid_: Match (a Trial matches a Watch), pass, fail, eligible, qualifies, screening (the clinic's visit)

**Watch**:
A named set of Search criteria that Trials are matched against. Every Member can see and follow any Watch that is not a Private watch; only its Owner can change or delete it. Who follows a Watch is never shown.
_Avoid_: Search, filter, query, subscription, saved search

**Search criteria**:
What a Watch asks for: conditions, keywords, distance from a ZIP code, Clinics, kinds of study, phases, statuses, age, sex, healthy volunteers. Anything left empty means "any". Something must narrow them: a condition, a keyword, a Clinic, or healthy volunteers with a ZIP code. Search criteria that name Clinics match only Trials with a site at one of them.
_Avoid_: Filter, query, criteria on its own, Entry criteria (those are a Trial's rules for who can join)

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
One hourly look at ClinicalTrials.gov, Watch by Watch, for Trials posted or changed since each Watch was last checked successfully. A Watch that can't be checked leaves no gap: it catches up the next time it can, without holding back the others. A Check fails only when no Watch could be checked.
_Avoid_: Poll, run, sync, scan

**New trial**:
For a given Member and Watch: a Trial that a Check finds matching the Watch for the first time after the Member started following it, and that the Member has never been alerted on. It need not be newly posted: a Trial posted long ago is new to a Watch when a change, such as an added site or reopened recruiting, makes it match for the first time. Trials the Watch already matched when it was created or its criteria changed are not new. A change to a Trial the Watch already matched does not make it new; it may cause an Update. A Watch that matches more than a thousand Trials cannot tell the two apart, so for it only newly posted Trials are new.
_Avoid_: Fresh trial, update

**Recent match**:
A Trial matching a Watch that was first posted in the 30 days before now. Shown on the Watch's page; never causes an Alert by itself.
_Avoid_: Backlog, history, results

### Alerts

**Alert**:
One notice to one Member about one Trial: a New trial, naming every Watch they follow that found it, or a Trial another Member sent them. A Member never gets two Alerts for the same Trial; it is pushed to all their Devices and kept in their Alert list. When another Watch of theirs finds the Trial later, the Alert they have gains that Watch's name and nothing else changes: it stays read or unread as it was and is not pushed again. A Member can mark an Alert "Interested" or "Not for me" and keep a note on it; only they see either.
_Avoid_: Ping, notification, message

**Update**:
News about a Trial a Member already has an Alert for: it has started recruiting, or added a site within the distance of a Watch of theirs that found it. A Watch with no ZIP code is measured from the Member's Profile instead, as it is for a new Alert; a Watch with one is never measured from the Profile. The Alert turns unread and says what changed; it is still the one Alert for that Trial. Alerts marked "Not for me" get no Updates.
_Avoid_: Change alert, second Alert, re-alert

**Push**:
What appears on a Member's Devices when Alerts are created or get an Update, or when a Waiting period ends. A Push carries a single Alert, or, when a Member has more than three Alerts waiting, one Push summarises them all and opens the Alert list. The Push for an ended Waiting period names no study, Clinic or waiting: it says there is a note to read, and is never counted as an Alert. A Push that reaches none of a Member's Devices is tried again with each Check for a day. A Push for a new Opening is the exception on three counts: it is sent only to a Member who asked for it at that Clinic, it names the Clinic and gives the entry in the Clinic's own words, and it is sent once, straight after the Clinic read, and not tried again. More than three at once become one Push. An Opening of a study the Member marked “Not for me” is left out.
_Avoid_: Notification (the phone's or browser's own word for what a Member allows: say it only where they turn Pushes on), ping, Alert (an Alert is the record; a Push is how it is announced)

**Alert list**:
Every Alert a Member has received, newest first, each marked read or unread. The record of truth when a push is missed or a Member has no Device.
_Avoid_: Inbox, feed, history, notifications

### Clinics

**Clinic**:
A research unit that pays healthy volunteers and advertises its studies on its own website, such as Celerion in Lincoln or Fortrea in Madison. GuineaPing keeps the list of Clinics by hand: name, city, and a link to the Clinic’s own list of studies. Every Member starts with the same Clinics, nearest first when their Profile has a ZIP code. A Member can take a Clinic off their own list, for instance one too far to travel to: it and its Openings no longer show for them, their Push for new Openings there is turned off, and only they can see that they did it. Clinics taken off are counted at the foot of the list and can be put back. A Trial is at a Clinic when its listing names a site by one of the names the Clinic goes by, in the Clinic’s city; a Trial that names no site is not tied to any Clinic.
_Avoid_: Site (a site is one place a Trial runs), facility, CRO, unit

**Organiser**:
The Member who runs the group: whoever has been a Member longest. Only the Organiser sees the list of Members, invites people and removes them. If the Organiser leaves, the Member who has been in the group longest after them becomes the Organiser. A Tip goes to the person who runs GuineaPing, who is named in the Worker’s settings and need not be the same.
_Avoid_: Owner (an Owner is of a Watch), admin, moderator

**Tip**:
Money a Member chooses to send the person who runs GuineaPing, through a payment service of the Member’s own. GuineaPing shows only where to send it: it moves no money, and never learns who tipped or how much. Nothing a Member sees or is sent depends on whether they tip.
_Avoid_: Fee, subscription, payment, donation

**Opening**:
One entry on a Clinic’s own list of studies, shown in the Clinic’s own words: what it pays, when, how long the stay is, and who it is for. An Opening is not a Trial and is not tied to one, because Clinics give no NCT ID. It links to its page on the Clinic’s site. A Member can set an Opening aside, which only they see, in one of two ways. “Not this time” is for a reason that will change, such as the dates: it covers that one entry as it stood, so the same study listed again, with new dates or a new group, shows again. “Not for me” is for a reason that won’t change: it covers the study itself at that Clinic, every group of it, now and later. Which entries are one study is read from the Clinic’s own study code, so an entry with no code can only be set aside “Not this time”. Nothing set aside is removed: each Clinic shows how many are, and they can be shown and put back. A Member can ask, Clinic by Clinic, for a Push when a Clinic read finds a new Opening there; which Clinics they chose is theirs alone to see.
_Avoid_: Study, listing, Trial, posting

**Follow-up visit**:
A visit to the Clinic that an Opening asks for besides its stay: what Clinics call an outpatient, return or follow-up visit. A screening visit is not one, and nor is a phone call. A Member can limit the Openings they see to those with no more than a number of them, a choice kept on the phone or computer they made it on. GuineaPing reads the number from the Clinic’s own words only to apply that limit, and never shows it: where the words give a range or several figures the lowest counts, so that no Opening is hidden that might fit, and an Opening that doesn’t say how many is always shown.
_Avoid_: Follow-up on its own, follow (a Follow is of a Watch), outpatient visit, return visit, check-up

**Clinic read**:
One look at a Clinic’s list, at most once an hour, that records which Openings are there now and which of them are new: an entry the list did not have before, one that had gone and is back, or one whose study code or dates have changed. A Clinic’s first read finds nothing new. Only some Clinics are read. A Clinic whose terms forbid automated tools, or whose site turns them away, is never visited: Members open its list themselves.
_Avoid_: Scrape, crawl, Check (a Check is of ClinicalTrials.gov)
