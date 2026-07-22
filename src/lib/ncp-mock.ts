/**
 * Simulated HealthData@EU NCP query response.
 *
 * TEHDAS2 D6.4 describes the National Contact Point as the routing layer
 * through which a receiving HDAB retrieves cross-border applications that
 * have been queued for it by sending Member States. There is no public
 * reference NCP endpoint to call, so this module returns a fixed set of
 * realistic sample entries to demonstrate the retrieval flow. It stands in
 * for what would otherwise be an authenticated GET call to the NCP's
 * application queue API.
 */

import { HdeuPayload } from './hdeu';

export type NcpQueueEntry = HdeuPayload & { ncpTransactionId: string };

/**
 * Simulated outbound leg: transmitting a decision card for an HD@EU-sourced
 * application (D6.4 R9.2.1) via the NCP. There's no real NCP to send to, so
 * this just logs the transmission — the caller is responsible for recording
 * the "sent" timestamp on the application. Symmetrical to getMockNcpQueue()
 * below, which fakes the inbound leg for the same reason.
 */
export function sendDecisionCardToNcp(application: { id: string; hdeuApplicationId: string | null }): void {
  console.log(
    `[NCP mock] Decision card transmitted for application ${application.id} ` +
    `(HD@EU ref: ${application.hdeuApplicationId ?? 'unknown'})`,
  );
}

export function getMockNcpQueue(): NcpQueueEntry[] {
  return [
    {
      hdeuApplicationId: 'FI-HDAB-2025-0042',
      sendingCountry: 'FI',
      sendingHdab: 'Findata',
      transmissionTimestamp: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
      ncpTransactionId: 'NCP-TXN-20260630-014',
      applicationType: 'DATA_ACCESS_APPLICATION',
      applicantName: 'Dr. K. Virtanen',
      applicantEmail: 'k.virtanen@helsinki.fi',
      applicantOrganisation: 'University of Helsinki',
      title: 'Comparative analysis of type-2 diabetes outcomes in Finland and the Netherlands 2018-2023',
      projectDescription:
        'Cross-national cohort study comparing long-term complications and treatment pathways for type-2 diabetes patients in Finland and the Netherlands, leveraging routine primary care and hospital data from both countries.',
      purposeCategory: 'SCIENTIFIC_RESEARCH',
      legalBasis: 'EHDS Art. 53(1) – scientific research',
      requestedDatasets: ['GP_ELECTRONIC_RECORDS', 'HOSPITAL_DISCHARGE_RECORDS', 'MEDICATION_DISPENSING'],
      requestedVariables:
        'Age, sex, diabetes diagnosis date (ICD-10 E11), HbA1c, BMI, medication (ATC A10), hospitalisations, complications (ICD-10 E110-E149)',
      studyPopulation: 'Adults aged 18+ with a diagnosis of type-2 diabetes registered in Dutch general practices',
      inclusionCriteria: 'Age ≥18, ICD-10 E11 diagnosis confirmed, registered ≥1 year',
      exclusionCriteria: 'Type-1 diabetes, opt-out from research use',
      dataStartDate: '2018-01-01',
      dataEndDate: '2023-12-31',
      projectStartDate: '2026-09-01',
      projectEndDate: '2028-08-31',
      dataProcessingCountry: 'NL',
    },
    {
      hdeuApplicationId: 'DE-HDAB-2026-0187',
      sendingCountry: 'DE',
      sendingHdab: 'Forschungsdatenzentrum Gesundheit',
      transmissionTimestamp: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
      ncpTransactionId: 'NCP-TXN-20260629-231',
      applicationType: 'DATA_REQUEST',
      applicantName: 'Prof. Dr. A. Bergmann',
      applicantEmail: 'a.bergmann@charite.de',
      applicantOrganisation: 'Charité – Universitätsmedizin Berlin',
      title: 'Aggregated prevalence statistics of cardiovascular comorbidities in oncology patients',
      projectDescription:
        'Request for aggregated, non-identifiable statistical output on cardiovascular comorbidity prevalence among oncology patients treated in Dutch academic hospitals, for a multi-country EHDS feasibility comparison.',
      purposeCategory: 'PUBLIC_HEALTH',
      legalBasis: 'EHDS Art. 53(1) – public health',
      requestedDatasets: ['HOSPITAL_DISCHARGE_RECORDS', 'DISEASE_REGISTRIES'],
      requestedVariables: 'Aggregated counts by cancer type, cardiovascular comorbidity code (ICD-10 I00-I99), age band, sex',
      studyPopulation: 'Oncology patients treated in Dutch academic hospitals 2020-2025',
      inclusionCriteria: 'Confirmed oncology diagnosis, treatment episode 2020-2025',
      exclusionCriteria: 'Records with fewer than 10 patients per stratum (statistical disclosure control)',
      dataStartDate: '2020-01-01',
      dataEndDate: '2025-12-31',
      projectStartDate: '2026-08-01',
      projectEndDate: '2026-12-31',
      dataProcessingCountry: 'NL',
    },
  ];
}
