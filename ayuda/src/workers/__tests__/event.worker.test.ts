// tests/workers/event.worker.test.ts
import { Worker } from 'bullmq';
import { Server } from 'socket.io';

import { GameRedisRepository } from '../../repositories/game.repository';
import { GameService } from '../../services/game.service';
import { initializeEventWorker } from '../../workers/event.worker';

jest.mock('bullmq');
jest.mock('../../infrastructure/redis', () => ({
  bullmqConnection: {},
}));
jest.mock('../../repositories/game.repository');
jest.mock('../../services/game.service');

describe('Event Worker (game-events / Scheduler)', () => {
  let mockIo: any;
  let workerCallback: (job: any) => Promise<void>;
  let mockTriggerStar: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    (Worker as unknown as jest.Mock).mockImplementation(
      (_queueName, callback) => {
        workerCallback = callback;
        return { on: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
      },
    );

    mockTriggerStar = jest.fn().mockResolvedValue([]);
    (GameService as unknown as jest.Mock).mockImplementation(() => ({
      triggerStarEvent: mockTriggerStar,
    }));

    initializeEventWorker(mockIo as unknown as Server);
  });

  afterEach(() => {
    // Restauramos Math.random a su estado original después de cada test
    jest.spyOn(global.Math, 'random').mockRestore();
  });

  it('Debe disparar el evento de estrella si Math.random es menor a 0.15', async () => {
    // 1. Forzamos Math.random para que devuelva 0.10 (así entra en el IF del 15%)
    jest.spyOn(global.Math, 'random').mockReturnValue(0.1);

    // 2. Simulamos que hay dos salas activas
    (GameRedisRepository.getAllActiveLobbies as jest.Mock).mockResolvedValue([
      'SALA1',
      'SALA2',
    ]);

    // 3. Simulamos que el evento genera emisiones
    const mockEmission = [
      {
        room: 'SALA1',
        event: 'server:game:star_spawned',
        data: { x: 50, y: 50 },
      },
    ];
    mockTriggerStar.mockResolvedValue(mockEmission);

    const job = { name: 'check-random-events' };

    await workerCallback(job);

    // Verificamos que se evaluaron ambas salas
    expect(mockTriggerStar).toHaveBeenCalledTimes(2);
    expect(mockTriggerStar).toHaveBeenCalledWith('SALA1');
    expect(mockTriggerStar).toHaveBeenCalledWith('SALA2');

    // Verificamos que se emitieron los sockets
    expect(mockIo.to).toHaveBeenCalledWith('SALA1');
    expect(mockIo.emit).toHaveBeenCalledWith('server:game:star_spawned', {
      x: 50,
      y: 50,
    });
  });

  it('No debe disparar nada si Math.random es mayor a 0.15', async () => {
    // Forzamos un número alto (ej. 0.80)
    jest.spyOn(global.Math, 'random').mockReturnValue(0.8);
    (GameRedisRepository.getAllActiveLobbies as jest.Mock).mockResolvedValue([
      'SALA1',
    ]);

    const job = { name: 'check-random-events' };

    await workerCallback(job);

    // Como la probabilidad falló, nunca debe llamar al trigger
    expect(mockTriggerStar).not.toHaveBeenCalled();
  });
});
