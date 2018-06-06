import request from "supertest";
import app from "./app";
import { expressMiddleware } from '@/middlewares';

describe('test the express router', () => {
    beforeAll(() => {
        app.use(expressMiddleware)
    })

    test('it should not affect server start up', () => {
        return request(app).get("/").expect(200)
    });
})