
# Analytics Ingestion

This document describes the event-based analytics ingestion system.

## Overview

The analytics ingestion system is designed to be a durable, versioned, and idempotent stream of learning events. It is built on top of the following components:

- **`LearningEvent` schema**: A Mongoose schema that defines the structure of a learning event.
- **`AnalyticsIngestionService`**: A NestJS service that is responsible for ingesting learning events and storing them in the database.
- **`AnalyticsIngestionController`**: A NestJS controller that exposes an endpoint for ingesting learning events.
- **`LearningEventListener`**: A NestJS event listener that listens for domain events and records them as learning events.

## Event Schema

All learning events are stored in the `learningevents` collection in the database. The schema for a learning event is as follows:

- `eventId` (string, required): A unique identifier for the event.
- `eventName` (string, required): The name of the event.
- `schemaVersion` (number, required): The version of the event schema.
- `payload` (object, required): The event payload.
- `createdAt` (date, required): The date the event was created.
- `updatedAt` (date, required): The date the event was last updated.

## Privacy

The analytics ingestion system is designed to be privacy-conscious. All personally identifiable information (PII) is removed from the event payload before it is stored in the database.

## Abuse protection

`POST /analytics-ingestion` is public, so it is protected on two fronts:

- **Rate limit.** Each client IP may send **60 events per minute**. The limit is set on the route for every named throttler (`guest`, `auth`, `premium`, `admin`); a client that exceeds it receives `429 Too Many Requests`.
- **Validation.** The body is checked by the global `ValidationPipe`, which rejects unknown top-level fields. `eventId` (max 128 characters) and `eventName` (max 100 characters, letters, digits and `. _ : -` only) must be non-empty strings, `schemaVersion` must be an integer from 1 to 1000, and `payload` must be an object no larger than **10,000 bytes** as JSON. Anything else returns `400 Bad Request`.
