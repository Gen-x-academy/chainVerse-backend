import { Test, TestingModule } from '@nestjs/testing';
import { OutboxRelayJob } from '../jobs/outbox-relay.job';
import { OutboxService } from '../services/outbox.service';

/**
 * The relay is the only thing that turns staged rows into real events, and it
 * runs on a cron shared with the rest of the process. These tests pin the
 * property that keeps a broken outbox from taking the application down with it:
 * whatever happens inside a drain, the job ends up runnable again.
 */
describe('OutboxRelayJob', () => {
  let job: OutboxRelayJob;
  let outbox: { publishDue: jest.Mock };

  beforeEach(async () => {
    outbox = { publishDue: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OutboxRelayJob, { provide: OutboxService, useValue: outbox }],
    }).compile();

    job = module.get(OutboxRelayJob);
  });

  it('drains repeatedly until a pass publishes less than a full batch', async () => {
    // A burst larger than one batch must not be left entirely for the next tick:
    // the loop keeps going while each pass came back full.
    outbox.publishDue
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(3);

    await job.relay();

    expect(outbox.publishDue).toHaveBeenCalledTimes(3);
  });

  it('stops draining on an empty pass instead of spinning', async () => {
    outbox.publishDue.mockResolvedValue(0);

    await job.relay();

    expect(outbox.publishDue).toHaveBeenCalledTimes(1);
  });

  it('swallows a database failure and leaves itself able to run again', async () => {
    // The bug this guards: if the failure escaped, `running` would never be
    // reset and the relay would be permanently disabled for the life of the
    // process — silent, permanent event loss with no error anywhere.
    outbox.publishDue.mockRejectedValueOnce(new Error('mongo unreachable'));

    await expect(job.relay()).resolves.toBeUndefined();

    outbox.publishDue.mockResolvedValue(0);
    await expect(job.relay()).resolves.toBeUndefined();
    expect(outbox.publishDue).toHaveBeenCalledTimes(2);
  });

  it('does not run two drains concurrently', async () => {
    // `onApplicationBootstrap` and the 10s cron can overlap during a slow start.
    // A second concurrent drain would double the claim pressure for no benefit.
    let release: () => void = () => {};
    outbox.publishDue.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const first = job.relay();
    await job.relay();
    expect(outbox.publishDue).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});
