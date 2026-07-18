import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  canAccessMobileApp,
  canAccessNetwork,
  type UserRole,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';

export interface MobileNetworkPerson {
  id: string;
  full_name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
}

export interface MobileNetworkProducer {
  id: string;
  name: string;
  producer_code?: string | null;
  status?: string | null;
  contact_name?: string | null;
  mobile_number?: string | null;
}

export interface MobileNetworkKontikki {
  id: string;
  kontikki_code: string;
  module_id?: string | null;
  status: string;
  capacity?: number | null;
  biochar_producer_id?: string | null;
  producer?: MobileNetworkProducer | null;
  operators?: MobileNetworkPerson[];
}

export interface MobileNetworkFeedstock {
  id: string;
  biomass_type: string;
  lab_status: string;
  biochar_producer_id: string;
  producer?: MobileNetworkProducer | null;
}

export interface MobileNetworkFarm {
  id: string;
  farmer_name: string;
  address?: string | null;
  mobile_number?: string | null;
}

export interface MobileNetworkOverview {
  role: string;
  producers: MobileNetworkProducer[];
  kontikkis: MobileNetworkKontikki[];
  supervisors: MobileNetworkPerson[];
  climapreneurs: MobileNetworkPerson[];
  feedstock: MobileNetworkFeedstock[];
  farms: MobileNetworkFarm[];
}

const PRODUCER_SELECT = `
  id,
  name,
  producer_code,
  status,
  contact_name,
  mobile_number
`;

const KONTIKKI_SELECT = `
  id,
  kontikki_code,
  module_id,
  status,
  capacity,
  biochar_producer_id,
  biochar_producer:biochar_producers (
    id,
    name,
    producer_code,
    status,
    contact_name,
    mobile_number
  ),
  kontikki_operators (
    operator_id,
    users (
      id,
      full_name,
      role,
      email,
      phone
    )
  )
`;

@Injectable()
export class MobileNetworkService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async getOverview(user: AuthenticatedUser): Promise<MobileNetworkOverview> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to view network assignments');
    }

    if (canAccessNetwork(user.role)) {
      return this.getAdminOverview(user.role);
    }

    if (user.role === 'supervisor') {
      return this.getSupervisorOverview(user);
    }

    if (user.role === 'climapreneur') {
      return this.getClimapreneurOverview(user);
    }

    throw new ForbiddenException('Not allowed to view network assignments');
  }

  private async getAdminOverview(role: string): Promise<MobileNetworkOverview> {
    const [producers, kontikkis, supervisors, climapreneurs, feedstock, farms] =
      await Promise.all([
        this.fetchProducers(),
        this.fetchKontikkis(),
        this.fetchUsersByRole('supervisor'),
        this.fetchUsersByRole('climapreneur'),
        this.fetchFeedstock(),
        this.fetchAllFarms(),
      ]);

    return {
      role,
      producers,
      kontikkis,
      supervisors,
      climapreneurs,
      feedstock,
      farms,
    };
  }

  private async getSupervisorOverview(
    user: AuthenticatedUser,
  ): Promise<MobileNetworkOverview> {
    const producerIds = await this.fetchProducerIdsForSupervisor(user.id);
    const producers = await this.fetchProducers(producerIds);
    const kontikkis = await this.fetchKontikkis(producerIds);
    const climapreneurs = this.collectOperators(kontikkis);
    const supervisors = await this.fetchSupervisorsForProducers(producerIds);
    const [feedstock, farms] = await Promise.all([
      this.fetchFeedstock(producerIds),
      this.fetchAllFarms(),
    ]);

    return {
      role: user.role,
      producers,
      kontikkis,
      supervisors,
      climapreneurs,
      feedstock,
      farms,
    };
  }

  private async getClimapreneurOverview(
    user: AuthenticatedUser,
  ): Promise<MobileNetworkOverview> {
    const kontikkiIds = await this.fetchKontikkiIdsForOperator(user.id);
    const assignedKontikkis = await this.fetchKontikkis(undefined, kontikkiIds);
    const producerIds = [
      ...new Set(
        assignedKontikkis
          .map((row) => row.biochar_producer_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const producers = await this.fetchProducers(producerIds);
    const kontikkis = await this.fetchKontikkis(producerIds);
    const climapreneurs = this.collectOperators(kontikkis);
    const supervisors = await this.fetchSupervisorsForProducers(producerIds);
    const [feedstock, farms] = await Promise.all([
      this.fetchFeedstock(producerIds),
      this.fetchAllFarms(),
    ]);

    return {
      role: user.role,
      producers,
      kontikkis,
      supervisors,
      climapreneurs,
      feedstock,
      farms,
    };
  }

  private async fetchProducerIdsForSupervisor(
    supervisorId: string,
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('biochar_producer_supervisors')
      .select('biochar_producer_id')
      .eq('supervisor_id', supervisorId);

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => row.biochar_producer_id as string);
  }

  private async fetchKontikkiIdsForOperator(
    operatorId: string,
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('kontikki_operators')
      .select('kontikki_id')
      .eq('operator_id', operatorId);

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => row.kontikki_id as string);
  }

  private async fetchProducers(ids?: string[]): Promise<MobileNetworkProducer[]> {
    let query = this.supabase
      .from('biochar_producers')
      .select(PRODUCER_SELECT)
      .order('name', { ascending: true });

    if (ids) {
      if (ids.length === 0) return [];
      query = query.in('id', ids);
    }

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as MobileNetworkProducer[];
  }

  private async fetchKontikkis(
    producerIds?: string[],
    kontikkiIds?: string[],
  ): Promise<MobileNetworkKontikki[]> {
    let query = this.supabase
      .from('kontikkis')
      .select(KONTIKKI_SELECT)
      .order('kontikki_code', { ascending: true });

    if (kontikkiIds) {
      if (kontikkiIds.length === 0) return [];
      query = query.in('id', kontikkiIds);
    } else if (producerIds) {
      if (producerIds.length === 0) return [];
      query = query.in('biochar_producer_id', producerIds);
    }

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => this.mapKontikki(row));
  }

  private mapKontikki(row: Record<string, unknown>): MobileNetworkKontikki {
    const producerRaw = row.biochar_producer;
    const producer = Array.isArray(producerRaw)
      ? (producerRaw[0] as MobileNetworkProducer | undefined) ?? null
      : (producerRaw as MobileNetworkProducer | null);

    const operatorRows = Array.isArray(row.kontikki_operators)
      ? (row.kontikki_operators as Array<{
          users?: MobileNetworkPerson | MobileNetworkPerson[] | null;
        }>)
      : [];

    const operators: MobileNetworkPerson[] = operatorRows
      .map((assignment) => {
        const user = Array.isArray(assignment.users)
          ? assignment.users[0]
          : assignment.users;
        if (!user?.id) return null;
        return {
          id: user.id,
          full_name: user.full_name?.trim() || 'Unnamed',
          role: user.role || 'climapreneur',
          email: user.email ?? null,
          phone: user.phone ?? null,
        };
      })
      .filter((person): person is NonNullable<typeof person> => person !== null);

    return {
      id: row.id as string,
      kontikki_code: row.kontikki_code as string,
      module_id: (row.module_id as string | null) ?? null,
      status: row.status as string,
      capacity: (row.capacity as number | null) ?? null,
      biochar_producer_id: (row.biochar_producer_id as string | null) ?? null,
      producer,
      operators,
    };
  }

  private collectOperators(
    kontikkis: MobileNetworkKontikki[],
  ): MobileNetworkPerson[] {
    const byId = new Map<string, MobileNetworkPerson>();
    for (const kontikki of kontikkis) {
      for (const operator of kontikki.operators ?? []) {
        byId.set(operator.id, operator);
      }
    }
    return [...byId.values()].sort((a, b) =>
      a.full_name.localeCompare(b.full_name),
    );
  }

  private async fetchSupervisorsForProducers(
    producerIds: string[],
  ): Promise<MobileNetworkPerson[]> {
    if (producerIds.length === 0) return [];

    const { data: links, error } = await this.supabase
      .from('biochar_producer_supervisors')
      .select('supervisor_id')
      .in('biochar_producer_id', producerIds);

    if (error) throw new BadRequestException(error.message);

    const supervisorIds = [
      ...new Set((links ?? []).map((row) => row.supervisor_id as string)),
    ];

    return this.fetchUsersByIds(supervisorIds);
  }

  private async fetchUsersByRole(role: UserRole): Promise<MobileNetworkPerson[]> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, full_name, role, email, phone')
      .eq('role', role)
      .order('full_name', { ascending: true });

    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => ({
      id: row.id as string,
      full_name: (row.full_name as string | null)?.trim() || 'Unnamed',
      role: row.role as string,
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
    }));
  }

  private async fetchUsersByIds(ids: string[]): Promise<MobileNetworkPerson[]> {
    if (ids.length === 0) return [];

    const { data, error } = await this.supabase
      .from('users')
      .select('id, full_name, role, email, phone')
      .in('id', ids)
      .order('full_name', { ascending: true });

    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => ({
      id: row.id as string,
      full_name: (row.full_name as string | null)?.trim() || 'Unnamed',
      role: row.role as string,
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
    }));
  }

  private async fetchAllFarms(): Promise<MobileNetworkFarm[]> {
    const { data, error } = await this.supabase
      .from('farms')
      .select('id, farmer_name, address, mobile_number')
      .order('farmer_name', { ascending: true });

    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => ({
      id: row.id as string,
      farmer_name: (row.farmer_name as string | null)?.trim() || 'Unnamed farm',
      address: (row.address as string | null) ?? null,
      mobile_number: (row.mobile_number as string | null) ?? null,
    }));
  }

  private async fetchFeedstock(
    producerIds?: string[],
  ): Promise<MobileNetworkFeedstock[]> {
    let query = this.supabase
      .from('feedstocks')
      .select(
        `
        id,
        biomass_type,
        lab_status,
        biochar_producer_id,
        biochar_producer:biochar_producers (
          id,
          name,
          producer_code,
          status,
          contact_name,
          mobile_number
        )
      `,
      )
      .is('deleted_at', null)
      .order('biomass_type', { ascending: true });

    if (producerIds) {
      if (producerIds.length === 0) return [];
      query = query.in('biochar_producer_id', producerIds);
    }

    const { data, error } = await query;

    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => {
      const producerRaw = row.biochar_producer;
      const producer = Array.isArray(producerRaw)
        ? (producerRaw[0] as MobileNetworkProducer | undefined) ?? null
        : (producerRaw as MobileNetworkProducer | null);

      return {
        id: row.id as string,
        biomass_type: row.biomass_type as string,
        lab_status: row.lab_status as string,
        biochar_producer_id: row.biochar_producer_id as string,
        producer,
      };
    });
  }
}
