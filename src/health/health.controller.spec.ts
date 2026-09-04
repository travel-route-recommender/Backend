import { ServiceUnavailableException } from '@nestjs/common';
import { Connection, ConnectionStates } from 'mongoose';
import { HealthController } from './health.controller';

function createController(
  readyState: ConnectionStates,
  command: jest.Mock = jest.fn().mockResolvedValue({ ok: 1 }),
) {
  const connection = {
    readyState,
    db: readyState === ConnectionStates.connected ? { command } : undefined,
  } as unknown as Connection;

  return { controller: new HealthController(connection), command };
}

describe('HealthController', () => {
  it('reports liveness without checking dependencies', () => {
    const { controller } = createController(ConnectionStates.disconnected);
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('reports readiness after MongoDB responds', async () => {
    const { controller, command } = createController(
      ConnectionStates.connected,
    );

    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(command).toHaveBeenCalledWith({ ping: 1 }, { timeoutMS: 2_000 });
  });

  it('rejects readiness when MongoDB is disconnected', async () => {
    const { controller } = createController(ConnectionStates.disconnected);
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects readiness when MongoDB ping fails', async () => {
    const { controller } = createController(
      ConnectionStates.connected,
      jest.fn().mockRejectedValue(new Error('timeout')),
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
