import type { ReactNode } from "react";

export interface ArtisanProRecord {
  id: string;
  name: string;
  klins: string[];
  gps: string;
  productionPerYear: string;
  block: string;
  district: string;
  state: string;
}

export interface BioCharProducerRecord {
  id: string;
  name: string;
  designation: string;
  email: string;
  phone: string;
  projectSiteMode: string;
  lat: string;
  lng: string;
  searchQuery: string;
  mapsUrl: string;
  contractName: string;
  contractType: string;
  trainingCertName: string;
  trainingCertType: string;
  addressProofName: string;
  addressProofType: string;
}

export interface FarmRecord {
  id: string;
  name: string;
  phone: string;
  projectSiteMode: string;
  lat: string;
  lng: string;
  searchQuery: string;
  mapsUrl: string;
  shapeFileName: string;
  shapeFileType: string;
}

export interface KontikkiRecord {
  id: string;
  name: string;
  ownerType: string;
  ownerId: string;
  ownerName: string;
  topDiameter: string;
  bottomDiameter: string;
  depth: string;
  topViewName: string;
  topViewType: string;
  sideViewName: string;
  sideViewType: string;
  designDocName: string;
  designDocType: string;
}

export interface OwnerOption {
  value: string;
  label: string;
  type: string;
  id: string;
  name: string;
}

export interface SupervisorRecord {
  id: string;
  name: string;
  mobile: string;
  education: string;
  currentIncome: number;
  bikeAccess: boolean;
  partner: { id: string; name: string };
  cluster: string;
  training: {
    biocharDate: string;
    demoImages: string[];
    agreementSigned: boolean;
  };
  kyc: {
    bank: {
      accountName: string;
      accountNumber: string;
      ifsc: string;
      bankName: string;
    };
    pan: { url: string; name: string };
  };
}

export interface PartnerOption {
  id: string;
  orgName: string;
}

export interface ClusterOnboardingRecord {
  id: string;
  name: string;
  villages: ClusterOnboardingVillage[];
}

export interface ClusterOnboardingVillage {
  name: string;
  farmersCount: number;
  feedstock: { cottonAcres: number; chilliAcres: number };
  sowingDate: string;
  harvestDate: string;
  biomassUsage: string;
  gps: { lat: number; lng: number };
}

export interface UploadFieldProps {
  label: string;
  accept: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedName?: string;
}

export interface SectionProps {
  title: string;
  children: ReactNode;
}
