import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../test/db.js';
import { createPool } from '../db.js';
import { healthRouter } from './health.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

const appWith = p => express().use(healthRouter(p));

describe('GET /healthz', () => {
  it('répond ok quand la base répond', async () => {
    const res = await request(appWith(pool)).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('répond 503 quand la base est indisponible', async () => {
    const broken = { query: () => Promise.reject(new Error('down')) };
    const res = await request(appWith(broken)).get('/healthz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false });
  });
});
