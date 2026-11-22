# Web push plus the Alert list, no email

Alerts reach Members only as web push to their Devices, backed by an in-app Alert list that keeps every Alert. We send no email, even though sign-in already knows each Member's address. Email was the obvious choice for patients and family members. We chose push because it is immediate and needs no email-sending setup, and the Alert list covers its weak spots: a dismissed push, or a Member with no Device.

## Considered Options

- **Email**: works for everyone, but alerts land in a crowded inbox, and it means maintaining sending and deliverability.
- **ntfy**: what the old poller used. Every Member would have to install a separate app.

## Consequences

- On iPhone, web push only works after a Member adds GuineaPing to their Home Screen (iOS 16.4+). Onboarding has to walk them through it. A Member who skips it still gets every Alert in their Alert list, just without a push.
- If email is ever added, it should be another way to deliver the same Alert, not a second Alert. The rule of one Alert per Member per Trial still holds.
