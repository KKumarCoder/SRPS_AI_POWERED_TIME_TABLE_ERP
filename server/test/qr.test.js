import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {verifyToken} from '../src/services/qr.js';
process.env.QR_SIGNING_SECRET='test-only-secret-not-for-production-123456789';
const sign=(payload={},options={})=>jwt.sign({teacherId:'teacher',date:'2026-10-04',nonce:'random',...payload},process.env.QR_SIGNING_SECRET,{algorithm:'HS256',audience:'srps-attendance',issuer:'srps',expiresIn:'1h',...options});
test('QR validates signature, audience and issuer',()=>{assert.equal(verifyToken(sign()).teacherId,'teacher');assert.throws(()=>verifyToken(sign({}, {audience:'wrong'})));assert.throws(()=>verifyToken(sign({}, {issuer:'wrong'})));});
test('QR rejects expired and tampered payloads',()=>{assert.throws(()=>verifyToken(sign({}, {expiresIn:-1})));const token=sign();const pieces=token.split('.');pieces[1]=Buffer.from(JSON.stringify({teacherId:'another-teacher'})).toString('base64url');assert.throws(()=>verifyToken(pieces.join('.')));});
