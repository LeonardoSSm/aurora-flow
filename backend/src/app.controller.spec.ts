import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(() => {
    controller = new AppController();
  });

  it('should return a healthy payload', () => {
    const result = controller.health();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('aurora-flow-backend');
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });
});
