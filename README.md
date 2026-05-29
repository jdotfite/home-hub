# Todo

Personal todo system scaffolded for the Office desktop `_websites/todo` folder.

Architecture:

- **SQLite database** is the source of truth.
- **Task API** owns all task mutations and queries.
- **Discord/Hermes** is only a quick-capture interface.
- **Web app** is for organizing and editing.
- **E-ink endpoint** is a passive dashboard/feed.
- Todoist sync can be added later as an adapter without changing the task model.

## Quick start

```bash
npm install
npm run init-db
npm start
```

Default server: <http://localhost:3456>

Override with environment variables:

```bash
PORT=3456 TODO_DB=./data/todo.sqlite npm start
```

## Discord command parser API

Hermes can parse Discord slash-style text and call this endpoint:

```http
POST /api/discord/command
Content-Type: application/json

{ "command": "/todo add Fix arcade joystick" }
```

Supported Phase 1 commands:

- `/todo add Fix arcade joystick`
- `/todo list`
- `/todo done 4`
- `/todo today`
- `/todo project arcade`

The numeric IDs shown in list responses are display indexes for the filtered response, not permanent database IDs.

## Core API

- `GET /api/tasks?status=open|done&view=inbox|today&project=arcade`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `POST /api/tasks/:id/complete`
- `POST /api/tasks/reorder`
- `GET /api/projects`
- `GET /api/eink/today`
- `GET /api/eink/today.svg`

## Web pages

- `/inbox`
- `/today`
- `/projects`
- `/eink`
- `/done`

## E-ink JSON

```json
{
  "title": "Today",
  "tasks": ["Fix joystick vertical wiggle"],
  "waiting": ["Bolts from Amazon"]
}
```

SVG output is intentionally simple: large type, high contrast, few items.
