import { RequestHandler } from 'express';

export const expressMiddleware: RequestHandler = (req, res, next) => {
  console.log('something');
  next()
}