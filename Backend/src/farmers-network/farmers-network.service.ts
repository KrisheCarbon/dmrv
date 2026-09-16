import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  canAccessMobileApp,
  canAccessWebPortal,
  type FarmFieldRecord,
  type FarmFieldUpsertPayload,
  type FarmerConsentRecord,
  type FarmerConsentUpsertPayload,
  type Farmer,
  type SoilTestFormOptions,
  type SoilTestRecord,
  type SoilTestReportPayload,
  type SoilTestUpsertPayload,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { fetchAllPages } from '../supabase/fetch-all-pages';
import type { AuthenticatedUser } from '../auth/auth.types';

const FIELD_SELECT = `
  id,
  farm_id,
  field_code,
  ownership_type,
  land_reference,
  lease_start,
  lease_end,
  status,
  latitude,
  longitude,
  boundary_geojson,
  calculated_area,
  water_source,
  photos,
  notes,
  crop_name,
  season,
  sowing_date,
  harvest_date,
  crop_photos,
  created_by,
  created_at,
  updated_at,
  farm:farms (
    id,
    farmer_name,
    total_land_size
  )
`;

const CONSENT_SELECT = `
  id,
  farm_id,
  agreement_type,
  consent_status,
  consent_date,
  valid_from,
  valid_to,
  agreement_reference,
  photos,
  evidence_notes,
  created_by,
  created_at,
  updated_at,
  farm:farms (
    id,
    farmer_name
  )
`;

const SOIL_TEST_SELECT = `
  id,
  farm_id,
  sample_date,
  sample_lat,
  sample_lng,
  sample_photo_url,
  receive_photo_url,
  submitted_to_supervisor_id,
  collected_by,
  collected_by_role,
  status,
  received_at,
  received_by,
  created_by,
  created_at,
  updated_at,
  farm:farms (
    id,
    farmer_name,
    village
  ),
  submitted_to_supervisor:users!soil_tests_submitted_to_supervisor_id_fkey (
    id,
    full_name
  ),
  collected_by_user:users!soil_tests_collected_by_fkey (
    id,
    full_name
  ),
  received_by_user:users!soil_tests_received_by_fkey (
    id,
    full_name
  ),
  soil_test_fields (
    farm_field_id,
    farm_fields (
      id,
      field_code,
      calculated_area
    )
  ),
  reports:soil_reports (
    id,
    farm_id,
    soil_test_id,
    report_date,
    source,
    results_summary,
    document_url,
    created_by,
    created_at,
    updated_at
  )
`;

@Injectable()
export class FarmersNetworkService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  private assertMobile(user: AuthenticatedUser) {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to manage farmers network records');
    }
  }

  private assertAccess(user: AuthenticatedUser) {
    if (!canAccessMobileApp(user.role) && !canAccessWebPortal(user.role)) {
      throw new ForbiddenException('Not allowed to view farmers network records');
    }
  }

  private canViewAll(user: AuthenticatedUser) {
    return canAccessWebPortal(user.role);
  }

  private async visibleFarmIds(user: AuthenticatedUser): Promise<string[] | null> {
    if (this.canViewAll(user)) return null;

    const farms = await fetchAllPages<Farmer>((from, to) =>
      this.supabase
        .from('farms')
        .select('id')
        .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)
        .range(from, to),
    );

    return farms.map((farm) => farm.id);
  }

  private async getFarm(user: AuthenticatedUser, farmId: string): Promise<Farmer> {
    const { data, error } = await this.supabase
      .from('farms')
      .select('*')
      .eq('id', farmId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Farmer not found');

    const farm = data as Farmer;
    if (
      !this.canViewAll(user) &&
      farm.created_by !== user.id &&
      farm.assigned_to !== user.id
    ) {
      throw new ForbiddenException('Not allowed to use this farmer');
    }

    return farm;
  }

  private asArray<T>(value: T | T[] | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  private parseJsonArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === 'string')
          : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private mapField(row: Record<string, unknown>): FarmFieldRecord {
    const farmRaw = row.farm;
    const farm = this.asArray(farmRaw)[0] as FarmFieldRecord['farm'] | undefined;
    return {
      ...(row as unknown as FarmFieldRecord),
      photos: this.parseJsonArray(row.photos),
      crop_photos: this.parseJsonArray(row.crop_photos),
      farm: farm ?? null,
    };
  }

  private mapConsent(row: Record<string, unknown>): FarmerConsentRecord {
    const farmRaw = row.farm;
    const farm = this.asArray(farmRaw)[0] as FarmerConsentRecord['farm'] | undefined;
    return {
      ...(row as unknown as FarmerConsentRecord),
      photos: this.parseJsonArray(row.photos),
      farm: farm ?? null,
    };
  }

  private mapSoilTest(row: Record<string, unknown>): SoilTestRecord {
    const farm = this.asArray(row.farm)[0] as SoilTestRecord['farm'] | undefined;
    const supervisor = this.asArray(row.submitted_to_supervisor)[0] as
      | SoilTestRecord['submitted_to_supervisor']
      | undefined;
    const collected = this.asArray(row.collected_by_user)[0] as
      | SoilTestRecord['collected_by_user']
      | undefined;
    const received = this.asArray(row.received_by_user)[0] as
      | SoilTestRecord['received_by_user']
      | undefined;
    const links = this.asArray(row.soil_test_fields) as Array<{
      farm_field_id?: string;
      farm_fields?: { id: string; field_code?: string | null; calculated_area?: number | null };
    }>;
    const fields = links
      .map((link) => {
        const field = this.asArray(link.farm_fields)[0];
        if (field?.id) return field;
        if (link.farm_field_id) {
          return { id: link.farm_field_id, field_code: null, calculated_area: null };
        }
        return null;
      })
      .filter((field): field is NonNullable<typeof field> => Boolean(field));

    return {
      ...(row as unknown as SoilTestRecord),
      field_ids: fields.map((field) => field.id),
      fields,
      farm: farm ?? null,
      submitted_to_supervisor: supervisor ?? null,
      collected_by_user: collected ?? null,
      received_by_user: received ?? null,
      reports: this.asArray(row.reports) as SoilTestRecord['reports'],
    };
  }

  // ---------------------------------------------------------------------------
  // Fields
  // ---------------------------------------------------------------------------

  async listFields(
    user: AuthenticatedUser,
    farmId?: string,
  ): Promise<FarmFieldRecord[]> {
    this.assertAccess(user);
    const farmIds = farmId ? [farmId] : await this.visibleFarmIds(user);
    if (farmIds && farmIds.length === 0) return [];

    const rows = await fetchAllPages<Record<string, unknown>>((from, to) => {
      let query = this.supabase
        .from('farm_fields')
        .select(FIELD_SELECT)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (farmIds) query = query.in('farm_id', farmIds);
      return query;
    });

    return rows.map((row) => this.mapField(row));
  }

  async getField(user: AuthenticatedUser, id: string): Promise<FarmFieldRecord> {
    this.assertAccess(user);
    const { data, error } = await this.supabase
      .from('farm_fields')
      .select(FIELD_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Field not found');
    const field = this.mapField(data as Record<string, unknown>);
    await this.getFarm(user, field.farm_id);
    return field;
  }

  private async assertFieldAreaCap(
    farm: Farmer,
    nextArea: number,
    excludeFieldId?: string,
  ) {
    const cap = Number(farm.total_land_size ?? 0);
    if (!cap || cap <= 0) {
      throw new BadRequestException(
        'Set the farmer cultivated land before adding fields.',
      );
    }

    const { data, error } = await this.supabase
      .from('farm_fields')
      .select('id, calculated_area, status')
      .eq('farm_id', farm.id)
      .eq('status', 'active');

    if (error) throw new BadRequestException(error.message);

    const existing = (data ?? []).reduce((sum, row) => {
      if (excludeFieldId && row.id === excludeFieldId) return sum;
      return sum + Number(row.calculated_area ?? 0);
    }, 0);

    if (existing + nextArea > cap + 0.0001) {
      const remaining = Math.max(cap - existing, 0);
      throw new BadRequestException(
        `Field area cannot exceed cultivated land (${cap} acres). ${remaining} acres remaining.`,
      );
    }
  }

  async createField(
    user: AuthenticatedUser,
    payload: FarmFieldUpsertPayload,
  ): Promise<FarmFieldRecord> {
    this.assertMobile(user);
    const farm = await this.getFarm(user, payload.farm_id);
    const area = Number(payload.calculated_area ?? 0);
    if (!area || area <= 0) {
      throw new BadRequestException('Plot area (acres) is required.');
    }
    await this.assertFieldAreaCap(farm, area);

    const insert = {
      id: payload.id,
      farm_id: payload.farm_id,
      field_code: payload.field_code || `FLD-${Date.now().toString(36).toUpperCase()}`,
      ownership_type: payload.ownership_type || 'Owned',
      land_reference: payload.land_reference || null,
      lease_start: payload.lease_start || null,
      lease_end: payload.lease_end || null,
      status: payload.status || 'active',
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      boundary_geojson: payload.boundary_geojson ?? null,
      calculated_area: area,
      water_source: payload.water_source || null,
      photos: payload.photos ?? [],
      notes: payload.notes || null,
      crop_name: payload.crop_name || null,
      season: payload.season || null,
      sowing_date: payload.sowing_date || null,
      harvest_date: payload.harvest_date || null,
      crop_photos: payload.crop_photos ?? [],
      created_by: user.id,
    };

    const { data, error } = await this.supabase
      .from('farm_fields')
      .insert(insert)
      .select(FIELD_SELECT)
      .single();

    if (error) throw new BadRequestException(error.message);
    return this.mapField(data as Record<string, unknown>);
  }

  async updateField(
    user: AuthenticatedUser,
    id: string,
    payload: Partial<FarmFieldUpsertPayload>,
  ): Promise<FarmFieldRecord> {
    this.assertMobile(user);
    const existing = await this.getField(user, id);
    const farm = await this.getFarm(user, existing.farm_id);
    const nextArea = Number(
      payload.calculated_area ?? existing.calculated_area ?? 0,
    );
    if (nextArea > 0) {
      await this.assertFieldAreaCap(farm, nextArea, id);
    }

    const patch: Record<string, unknown> = {};
    const keys: Array<keyof FarmFieldUpsertPayload> = [
      'ownership_type',
      'land_reference',
      'lease_start',
      'lease_end',
      'status',
      'latitude',
      'longitude',
      'boundary_geojson',
      'calculated_area',
      'water_source',
      'photos',
      'notes',
      'crop_name',
      'season',
      'sowing_date',
      'harvest_date',
      'crop_photos',
    ];
    for (const key of keys) {
      if (payload[key] !== undefined) patch[key] = payload[key];
    }

    const { data, error } = await this.supabase
      .from('farm_fields')
      .update(patch)
      .eq('id', id)
      .select(FIELD_SELECT)
      .single();

    if (error) throw new BadRequestException(error.message);
    return this.mapField(data as Record<string, unknown>);
  }

  // ---------------------------------------------------------------------------
  // Consents
  // ---------------------------------------------------------------------------

  async listConsents(
    user: AuthenticatedUser,
    farmId?: string,
  ): Promise<FarmerConsentRecord[]> {
    this.assertAccess(user);
    const farmIds = farmId ? [farmId] : await this.visibleFarmIds(user);
    if (farmIds && farmIds.length === 0) return [];

    const rows = await fetchAllPages<Record<string, unknown>>((from, to) => {
      let query = this.supabase
        .from('farmer_consents')
        .select(CONSENT_SELECT)
        .order('consent_date', { ascending: false })
        .range(from, to);
      if (farmIds) query = query.in('farm_id', farmIds);
      return query;
    });

    return rows.map((row) => this.mapConsent(row));
  }

  async createConsent(
    user: AuthenticatedUser,
    payload: FarmerConsentUpsertPayload,
  ): Promise<FarmerConsentRecord> {
    this.assertMobile(user);
    await this.getFarm(user, payload.farm_id);
    if (!payload.valid_to) {
      throw new BadRequestException('Document deadline is required.');
    }

    const insert = {
      id: payload.id,
      farm_id: payload.farm_id,
      agreement_type: payload.agreement_type || 'Farmer consent',
      consent_status: payload.consent_status || 'active',
      consent_date: payload.consent_date || new Date().toISOString().slice(0, 10),
      valid_from: payload.valid_from || payload.consent_date || null,
      valid_to: payload.valid_to,
      agreement_reference: payload.agreement_reference || null,
      photos: payload.photos ?? [],
      evidence_notes: payload.evidence_notes || null,
      created_by: user.id,
    };

    const { data, error } = await this.supabase
      .from('farmer_consents')
      .insert(insert)
      .select(CONSENT_SELECT)
      .single();

    if (error) throw new BadRequestException(error.message);
    return this.mapConsent(data as Record<string, unknown>);
  }

  // ---------------------------------------------------------------------------
  // Soil tests
  // ---------------------------------------------------------------------------

  async getSoilFormOptions(user: AuthenticatedUser): Promise<SoilTestFormOptions> {
    this.assertAccess(user);
    const farmIds = await this.visibleFarmIds(user);
    const farmsQuery = this.supabase
      .from('farms')
      .select('id, farmer_name, village')
      .order('farmer_name', { ascending: true });

    const { data: farms, error: farmsError } = farmIds
      ? farmIds.length === 0
        ? { data: [], error: null }
        : await farmsQuery.in('id', farmIds)
      : await farmsQuery;

    if (farmsError) throw new BadRequestException(farmsError.message);

    const supervisors = await this.supervisorsForUser(user);

    return {
      farms: (farms ?? []).map((farm) => ({
        id: farm.id as string,
        farmer_name: (farm.farmer_name as string | null)?.trim() || 'Unnamed farmer',
        village: (farm.village as string | null) ?? null,
      })),
      supervisors,
    };
  }

  private async supervisorsForUser(
    user: AuthenticatedUser,
  ): Promise<Array<{ id: string; full_name: string }>> {
    if (user.role === 'supervisor') {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw new BadRequestException(error.message);
      return data
        ? [{ id: data.id, full_name: data.full_name?.trim() || 'Supervisor' }]
        : [];
    }

    if (this.canViewAll(user) || user.role === 'admin' || user.role === 'manager') {
      const rows = await fetchAllPages<Record<string, unknown>>((from, to) =>
        this.supabase
          .from('users')
          .select('id, full_name')
          .eq('role', 'supervisor')
          .order('full_name', { ascending: true })
          .range(from, to),
      );
      return rows.map((row) => ({
        id: row.id as string,
        full_name: ((row.full_name as string | null)?.trim() || 'Unnamed supervisor'),
      }));
    }

    const { data: kontikkiLinks, error: kontikkiError } = await this.supabase
      .from('kontikki_operators')
      .select('kontikki_id')
      .eq('operator_id', user.id);
    if (kontikkiError) throw new BadRequestException(kontikkiError.message);

    const kontikkiIds = (kontikkiLinks ?? []).map((row) => row.kontikki_id as string);
    if (kontikkiIds.length === 0) return [];

    const { data: kontikkis, error: kError } = await this.supabase
      .from('kontikkis')
      .select('biochar_producer_id')
      .in('id', kontikkiIds);
    if (kError) throw new BadRequestException(kError.message);

    const producerIds = [
      ...new Set(
        (kontikkis ?? [])
          .map((row) => row.biochar_producer_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (producerIds.length === 0) return [];

    const { data: supervisorLinks, error: sError } = await this.supabase
      .from('biochar_producer_supervisors')
      .select('supervisor_id')
      .in('biochar_producer_id', producerIds);
    if (sError) throw new BadRequestException(sError.message);

    const supervisorIds = [
      ...new Set((supervisorLinks ?? []).map((row) => row.supervisor_id as string)),
    ];
    if (supervisorIds.length === 0) return [];

    const { data: users, error: uError } = await this.supabase
      .from('users')
      .select('id, full_name')
      .in('id', supervisorIds)
      .order('full_name', { ascending: true });
    if (uError) throw new BadRequestException(uError.message);

    return (users ?? []).map((row) => ({
      id: row.id,
      full_name: row.full_name?.trim() || 'Unnamed supervisor',
    }));
  }

  async listSoilTests(
    user: AuthenticatedUser,
    options?: { farmId?: string; inbox?: boolean },
  ): Promise<SoilTestRecord[]> {
    this.assertAccess(user);
    const farmIds = options?.farmId
      ? [options.farmId]
      : await this.visibleFarmIds(user);

    const rows = await fetchAllPages<Record<string, unknown>>((from, to) => {
      let query = this.supabase
        .from('soil_tests')
        .select(SOIL_TEST_SELECT)
        .order('sample_date', { ascending: false })
        .range(from, to);

      if (options?.inbox && user.role === 'supervisor') {
        query = query.eq('submitted_to_supervisor_id', user.id);
      } else if (farmIds) {
        if (farmIds.length === 0) {
          query = query.eq('created_by', user.id);
        } else {
          query = query.or(
            `farm_id.in.(${farmIds.join(',')}),created_by.eq.${user.id},submitted_to_supervisor_id.eq.${user.id}`,
          );
        }
      }

      return query;
    });

    return rows.map((row) => this.mapSoilTest(row));
  }

  async getSoilTest(user: AuthenticatedUser, id: string): Promise<SoilTestRecord> {
    this.assertAccess(user);
    const { data, error } = await this.supabase
      .from('soil_tests')
      .select(SOIL_TEST_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Soil sample not found');
    const test = this.mapSoilTest(data as Record<string, unknown>);
    await this.getFarm(user, test.farm_id);
    return test;
  }

  async createSoilTest(
    user: AuthenticatedUser,
    payload: SoilTestUpsertPayload,
  ): Promise<SoilTestRecord> {
    this.assertMobile(user);
    await this.getFarm(user, payload.farm_id);
    if (!payload.field_ids?.length) {
      throw new BadRequestException('Select at least one field for the soil sample.');
    }

    const isSupervisor = user.role === 'supervisor' || this.canViewAll(user);
    const requestedStatus = payload.status?.trim();
    const status =
      requestedStatus || (isSupervisor ? 'accepted' : 'collected');
    const supervisorId = isSupervisor
      ? payload.submitted_to_supervisor_id || user.id
      : payload.submitted_to_supervisor_id || null;

    if (status === 'submitted' && !supervisorId) {
      throw new BadRequestException('Select the supervisor to submit this sample to.');
    }

    const insert = {
      id: payload.id,
      farm_id: payload.farm_id,
      sample_date: payload.sample_date || new Date().toISOString().slice(0, 10),
      sample_lat: payload.sample_lat ?? null,
      sample_lng: payload.sample_lng ?? null,
      sample_photo_url: payload.sample_photo_url || null,
      submitted_to_supervisor_id: supervisorId,
      collected_by: user.id,
      collected_by_role: user.role,
      status,
      received_at:
        status === 'accepted' || status === 'received' || status === 'stored'
          ? new Date().toISOString()
          : null,
      received_by:
        status === 'accepted' || status === 'received' || status === 'stored'
          ? user.id
          : null,
      created_by: user.id,
    };

    const { data, error } = await this.supabase
      .from('soil_tests')
      .insert(insert)
      .select('id')
      .single();

    if (error) throw new BadRequestException(error.message);

    const links = payload.field_ids.map((fieldId) => ({
      soil_test_id: data.id,
      farm_field_id: fieldId,
    }));
    const { error: linkError } = await this.supabase
      .from('soil_test_fields')
      .insert(links);
    if (linkError) throw new BadRequestException(linkError.message);

    return this.getSoilTest(user, data.id);
  }

  async submitSoilTest(
    user: AuthenticatedUser,
    id: string,
    supervisorId: string,
  ): Promise<SoilTestRecord> {
    this.assertMobile(user);
    if (!supervisorId) {
      throw new BadRequestException('Select the supervisor to submit this sample to.');
    }

    const existing = await this.getSoilTest(user, id);
    if (existing.created_by && existing.created_by !== user.id && !this.canViewAll(user)) {
      throw new ForbiddenException('Only the collector can submit this sample.');
    }

    const { error } = await this.supabase
      .from('soil_tests')
      .update({
        submitted_to_supervisor_id: supervisorId,
        status: 'submitted',
      })
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);
    return this.getSoilTest(user, id);
  }

  async reviewSoilTest(
    user: AuthenticatedUser,
    id: string,
    decision: 'accept' | 'reject' | 'store',
    receivePhotoUrl?: string | null,
  ): Promise<SoilTestRecord> {
    this.assertAccess(user);
    if (user.role !== 'supervisor' && !this.canViewAll(user)) {
      throw new ForbiddenException('Only supervisors can review samples.');
    }

    const existing = await this.getSoilTest(user, id);
    if (
      existing.submitted_to_supervisor_id &&
      existing.submitted_to_supervisor_id !== user.id &&
      !this.canViewAll(user)
    ) {
      throw new ForbiddenException('This sample was submitted to another supervisor.');
    }

    const status =
      decision === 'accept' ? 'accepted' : decision === 'reject' ? 'rejected' : 'stored';

    const { error } = await this.supabase
      .from('soil_tests')
      .update({
        status: existing.status === 'reported' ? existing.status : status,
        received_at: new Date().toISOString(),
        received_by: user.id,
        receive_photo_url: receivePhotoUrl || existing.receive_photo_url || null,
      })
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);
    return this.getSoilTest(user, id);
  }

  async receiveSoilTest(
    user: AuthenticatedUser,
    id: string,
  ): Promise<SoilTestRecord> {
    this.assertAccess(user);
    if (user.role !== 'supervisor' && !this.canViewAll(user)) {
      throw new ForbiddenException('Only supervisors can mark samples received.');
    }

    const existing = await this.getSoilTest(user, id);
    if (
      existing.submitted_to_supervisor_id &&
      existing.submitted_to_supervisor_id !== user.id &&
      !this.canViewAll(user)
    ) {
      throw new ForbiddenException('This sample was submitted to another supervisor.');
    }

    const { error } = await this.supabase
      .from('soil_tests')
      .update({
        status: existing.status === 'reported' ? existing.status : 'accepted',
        received_at: new Date().toISOString(),
        received_by: user.id,
      })
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);
    return this.getSoilTest(user, id);
  }

  async attachSoilReport(
    user: AuthenticatedUser,
    id: string,
    payload: SoilTestReportPayload,
  ): Promise<SoilTestRecord> {
    this.assertAccess(user);
    if (!canAccessWebPortal(user.role)) {
      throw new ForbiddenException('Soil reports are uploaded in the admin portal.');
    }
    if (!payload.document_url) {
      throw new BadRequestException('Upload a soil report PDF.');
    }

    const test = await this.getSoilTest(user, id);

    const { error: reportError } = await this.supabase.from('soil_reports').insert({
      farm_id: test.farm_id,
      soil_test_id: test.id,
      report_date: payload.report_date || new Date().toISOString().slice(0, 10),
      source: payload.source || 'Lab report',
      results_summary: payload.results_summary || null,
      document_url: payload.document_url,
      created_by: user.id,
    });
    if (reportError) throw new BadRequestException(reportError.message);

    const { error } = await this.supabase
      .from('soil_tests')
      .update({
        status: 'reported',
        received_at: test.received_at || new Date().toISOString(),
        received_by: test.received_by || user.id,
      })
      .eq('id', id);
    if (error) throw new BadRequestException(error.message);

    return this.getSoilTest(user, id);
  }
}
