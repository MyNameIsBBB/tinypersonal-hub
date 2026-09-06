# Task Management v1

Tasks represent work that must be completed. Schedule items represent events and recurring routines tied to time. Existing `ScheduleItem` records with type `TASK` remain readable for compatibility, but new work is created in the owner-scoped `WorkTask` table.

`Task` owns title, description, requirements, status, priority, optional deadline/start time, progress note, completion time, and ordered checklist items. `TaskChecklistItem` is a relational child so individual entries can be queried and updated. Creating a task and its initial checklist is one transaction.

The API is available under `/api/tasks`. AI contracts provide task list/detail/create/update/delete plus checklist add/update/delete. Every AI mutation becomes a `PendingAction`; backend execution validates inputs again and checks `ownerKey`. A task creation exposes one `createTask` call containing the complete checklist.

Routing distinguishes deadline/checklist/work language from calendar language. “พรุ่งนี้มีอะไรบ้าง” stays a schedule query, while “งานอะไรใกล้ deadline” is a task query. “วันนี้ควรทำอะไรก่อน” scopes both task and schedule reads. Today context includes overdue, due, and high-priority unfinished tasks with checklist progress.

Legacy task migration, task-note links, task dependencies, attachments, and recurring tasks are outside v1. Legacy rows cannot be assigned safely because they use `User.id` while chat sessions use `ownerKey`.
