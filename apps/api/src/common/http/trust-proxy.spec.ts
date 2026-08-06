import express from 'express';
import request from 'supertest';
import { getTrustedProxyHops } from './trust-proxy';

describe('trusted proxy configuration', () => {
  it('uses the original client IP through CloudFront and the ALB', async () => {
    const app = express();
    app.set('trust proxy', getTrustedProxyHops('2'));
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));

    const response = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.10, 198.51.100.20');

    expect(response.body).toEqual({ ip: '203.0.113.10' });
  });

  it('falls back to two trusted hops for invalid configuration', () => {
    expect(getTrustedProxyHops('not-a-number')).toBe(2);
    expect(getTrustedProxyHops('-1')).toBe(2);
  });
});
