import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { toPostgresJson } from '@krishecarbon/shared';
import { Observable } from 'rxjs';

/** Drops characters Postgres cannot store before any write reaches the database. */
@Injectable()
export class PostgresJsonInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ body?: unknown }>();
    if (request.body && typeof request.body === 'object') {
      request.body = toPostgresJson(request.body);
    }
    return next.handle();
  }
}
