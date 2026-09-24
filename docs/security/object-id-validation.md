# ObjectId validation on route parameters

Addresses #851.

## The rule

Every route parameter that names a MongoDB document is validated by
[`ParseObjectIdPipe`](../../src/common/pipes/parse-object-id.pipe.ts) before the
handler runs:

```ts
@Get(':id')
findOne(@Param('id', new ParseObjectIdPipe()) id: string) { … }
```

An invalid identifier returns a consistent **400 Bad Request** —
`"<param> must be a valid ObjectId"` — and never reaches Mongoose, so a
`CastError` can no longer surface as a 500.

## What counts as valid

The pipe requires the canonical 24-character hex form. `isValidObjectId` alone
also accepts any 12-character string, which would let an arbitrary path segment
be cast into an id and turn into a silent lookup miss rather than a clear 400.

## Parameters that are deliberately not checked

Not every `*Id` is a Mongo id. These are opted out explicitly, with the reason
recorded next to them in
[`src/common/pipes/object-id-param-coverage.spec.ts`](../../src/common/pipes/object-id-param-coverage.spec.ts):

| Parameter | Why |
| --- | --- |
| `badge/:tokenId` | On-chain NFT token id |
| `certification/:id` | Placeholder reference; the handler generates a file and never queries Mongo |
| `reports/tutor/:id` | Stub endpoint backed by static data |
| `de-fi/:positionId`, `:transactionId`, `:strategyId` | In-memory protocol service, not Mongo |
| `verification/:eventId` | Event UUID, already validated with `ParseUUIDPipe` |

## Keeping it consistent

A pipe that exists but is applied unevenly is the same bug as no pipe at all, so
the rule is enforced by a test rather than by review. `object-id-param-coverage.spec.ts`
walks every `*.controller.ts` under `src/` and fails when an identifier-shaped
parameter (`id` or `*Id`) reaches a handler without a pipe. It also fails when an
entry in the opt-out list goes stale, so the list cannot quietly rot.

Adding a route with an unvalidated Mongo id now breaks the unit test suite.
