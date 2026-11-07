import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

const SKEW_LIMIT_MS = 3 * 60 * 1000;

type ClockBody = {
  device_time?: unknown;
  gnss_time?: unknown;
  time_source?: unknown;
  device_clock_offset_ms?: unknown;
  clock_skew_detected?: unknown;
};

function timeOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

@Controller('clock')
@UseGuards(SupabaseAuthGuard)
export class ClockController {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  @Post('checks')
  async record(
    @Req() req: { authUser: AuthenticatedUser },
    @Body() body: ClockBody,
  ) {
    const serverTime = new Date();
    const deviceTime = timeOrNull(body.device_time);
    const gnssTime = timeOrNull(body.gnss_time);
    const deviceMs = deviceTime ? Date.parse(deviceTime) : NaN;
    const offsetMs = Number.isFinite(deviceMs)
      ? Math.round(deviceMs - serverTime.getTime())
      : null;
    const gnssMs = gnssTime ? Date.parse(gnssTime) : NaN;
    const gnssSkew =
      Number.isFinite(gnssMs) &&
      Number.isFinite(deviceMs) &&
      Math.abs(deviceMs - gnssMs) > SKEW_LIMIT_MS;
    const serverSkew = offsetMs != null && Math.abs(offsetMs) > SKEW_LIMIT_MS;
    const clockSkewDetected = serverSkew || gnssSkew || body.clock_skew_detected === true;
    const timeSource = body.time_source === 'server' || body.time_source === 'gnss'
      ? body.time_source
      : 'device';
    const reason = serverSkew
      ? 'Phone clock differs from the server clock.'
      : gnssSkew
        ? 'Phone clock differs from kiln GNSS time.'
        : body.clock_skew_detected === true
          ? 'Phone reported a clock change after the trusted clock was started.'
          : null;

    const { error } = await this.supabase.from('device_clock_checks').insert({
      user_id: req.authUser.id,
      device_time: deviceTime,
      gnss_time: gnssTime,
      server_time: serverTime.toISOString(),
      offset_ms: offsetMs,
      time_source: timeSource,
      clock_skew_detected: clockSkewDetected,
      reason,
    });

    if (error) {
      return {
        server_time: serverTime.toISOString(),
        device_clock_offset_ms: offsetMs,
        clock_skew_detected: clockSkewDetected,
        saved: false,
      };
    }

    return {
      server_time: serverTime.toISOString(),
      device_clock_offset_ms: offsetMs,
      clock_skew_detected: clockSkewDetected,
      saved: true,
    };
  }
}
