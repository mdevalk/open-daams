import { PrismaClient, UserRole, ApplicationType, ApplicationStatus, DecisionOutcome, DecisionTrack } from '@prisma/client';
import { addMonths, subDays, subWeeks } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  const applicant1 = await prisma.user.upsert({
    where: { email: 'researcher@umcu.nl' },
    update: {},
    create: { name: 'Dr. A. de Vries', email: 'researcher@umcu.nl', role: UserRole.APPLICANT, organisation: 'UMC Utrecht' },
  });
  const applicant2 = await prisma.user.upsert({
    where: { email: 'analyst@rivm.nl' },
    update: {},
    create: { name: 'M. Jansen', email: 'analyst@rivm.nl', role: UserRole.APPLICANT, organisation: 'RIVM' },
  });
  const handler = await prisma.user.upsert({
    where: { email: 'casehandler@hdab.nl' },
    update: {},
    create: { name: 'S. Bakker', email: 'casehandler@hdab.nl', role: UserRole.CASE_HANDLER, organisation: 'HDAB-NL' },
  });
  const decisionMaker = await prisma.user.upsert({
    where: { email: 'director@hdab.nl' },
    update: {},
    create: { name: 'P. van den Berg', email: 'director@hdab.nl', role: UserRole.DECISION_MAKER, organisation: 'HDAB-NL' },
  });

  // App 1: in PROCESSING
  const submittedAt1 = subDays(new Date(), 35);
  const app1 = await prisma.application.upsert({
    where: { referenceNumber: 'HDAB-2025-0001' },
    update: {},
    create: {
      referenceNumber: 'HDAB-2025-0001',
      type: ApplicationType.DATA_ACCESS_APPLICATION,
      status: ApplicationStatus.PROCESSING,
      applicantId: applicant1.id,
      caseHandlerId: handler.id,
      title: 'Cardiovascular risk factors in Dutch primary care 2015-2024',
      projectDescription: 'Retrospective cohort study analysing long-term trends in cardiovascular risk factor prevalence using routine primary care data.',
      purposeCategory: 'SCIENTIFIC_RESEARCH',
      requestedDatasets: {
        createMany: {
          data: [
            { dataHolderName: 'GP Information Network (LINH)', name: 'Huisartsenregistratie cardiovasculair risicomanagement' },
            { dataHolderName: 'GP Information Network (LINH)', name: 'Medicatievoorschriften huisartsenpraktijken (ATC A10)' },
            {
              dataHolderName: 'CBS',
              name: "Overleden inwoners van Nederland naar doodsoorzaak (uitgebreide lijst van 'drie-teken categorieën'), leeftijd en geslacht",
              url: 'https://acceptance.data.health.europa.eu/healthdata-central-platform/datasets/24b6a9b2-4519-4f94-8c0f-c4c85f295806?locale=nl',
            },
          ],
        },
      },
      requestedVariables: 'Age, sex, BMI, blood pressure, HbA1c, lipid panel, medication records (ATC codes C01-C10)',
      studyPopulation: 'Adults aged 18-80 registered in Dutch general practices',
      inclusionCriteria: 'Age 18-80, registered ≥1 year, at least one cardiovascular risk factor recorded',
      exclusionCriteria: 'Incomplete registration, opt-out from research use',
      dataStartDate: new Date('2015-01-01'),
      dataEndDate: new Date('2024-12-31'),
      projectStartDate: new Date('2025-03-01'),
      projectEndDate: new Date('2027-02-28'),
      legalBasis: 'EHDS Art. 53(1) – scientific research',
      dataProcessingCountry: 'NL',
      submittedAt: submittedAt1,
      decisionTrack: DecisionTrack.STANDARD,
      decisionDeadline: addMonths(submittedAt1, 3),
    },
  });

  // App 2: AWAITING_ADDITIONAL_INFORMATION
  const submittedAt2 = subDays(new Date(), 20);
  const app2 = await prisma.application.upsert({
    where: { referenceNumber: 'HDAB-2025-0002' },
    update: {},
    create: {
      referenceNumber: 'HDAB-2025-0002',
      type: ApplicationType.DATA_REQUEST,
      status: ApplicationStatus.AWAITING_ADDITIONAL_INFORMATION,
      applicantId: applicant2.id,
      caseHandlerId: handler.id,
      title: 'COVID-19 vaccination coverage by municipality 2021-2023',
      projectDescription: 'Aggregated statistical analysis of COVID-19 vaccination uptake stratified by municipality, age group, and socioeconomic status.',
      purposeCategory: 'PUBLIC_HEALTH',
      requestedDatasets: {
        createMany: {
          data: [{ dataHolderName: 'RIVM', name: 'Praeventis — landelijke vaccinatieregistratie' }],
        },
      },
      requestedVariables: 'Vaccination date, vaccine type, municipality code, age group, CBS socioeconomic quintile',
      studyPopulation: 'Dutch population aged 12+ who were eligible for COVID-19 vaccination',
      inclusionCriteria: 'Age ≥12 at time of vaccination eligibility',
      exclusionCriteria: 'None',
      dataStartDate: new Date('2021-01-01'),
      dataEndDate: new Date('2023-12-31'),
      projectStartDate: new Date('2025-04-01'),
      projectEndDate: new Date('2025-12-31'),
      legalBasis: 'EHDS Art. 69 – statistical data request',
      dataProcessingCountry: 'NL',
      submittedAt: submittedAt2,
      decisionTrack: DecisionTrack.EXPEDITED,
      decisionDeadline: addMonths(submittedAt2, 2),
      additionalInfoDeadline: addMonths(subWeeks(new Date(), 1), 0),
    },
  });

  // App 3: DRAFT
  await prisma.application.upsert({
    where: { referenceNumber: 'HDAB-2025-0003' },
    update: {},
    create: {
      referenceNumber: 'HDAB-2025-0003',
      type: ApplicationType.DATA_ACCESS_APPLICATION,
      status: ApplicationStatus.DRAFT,
      applicantId: applicant1.id,
      title: 'Mental health service utilisation in adolescents post-COVID',
      projectDescription: 'Analysis of mental health service use among 12-25 year olds in the period 2019-2024.',
      purposeCategory: 'SCIENTIFIC_RESEARCH',
      requestedDatasets: {
        createMany: {
          data: [
            { dataHolderName: 'Vektis', name: 'Declaraties geestelijke gezondheidszorg (GGZ)' },
            { dataHolderName: 'GP Information Network (LINH)', name: 'Huisartsenregistratie verwijzingen GGZ' },
          ],
        },
      },
      requestedVariables: 'Age, sex, diagnosis codes (ICD-10 F codes), referral pathway, treatment episodes',
      studyPopulation: 'Adolescents and young adults aged 12-25',
      inclusionCriteria: 'Age 12-25, at least one contact with mental health services',
      exclusionCriteria: 'Opt-out from research use',
      dataStartDate: new Date('2019-01-01'),
      dataEndDate: new Date('2024-12-31'),
      projectStartDate: new Date('2025-06-01'),
      projectEndDate: new Date('2027-05-31'),
      legalBasis: 'EHDS Art. 53(1) – scientific research',
      dataProcessingCountry: 'NL',
    },
  });

  // Audit logs for app1
  for (const entry of [
    { from: null, to: ApplicationStatus.DRAFT, action: 'Application created', userId: applicant1.id },
    { from: ApplicationStatus.DRAFT, to: ApplicationStatus.SUBMITTED, action: 'Application submitted', userId: applicant1.id },
    { from: ApplicationStatus.SUBMITTED, to: ApplicationStatus.PRE_SCREENING, action: 'Start pre-screening', userId: handler.id },
    { from: ApplicationStatus.PRE_SCREENING, to: ApplicationStatus.PROCESSING, action: 'Complete pre-screening — proceed to processing', userId: handler.id, comment: 'All mandatory fields complete and consistent.' },
  ]) {
    await prisma.auditLog.create({
      data: {
        applicationId: app1.id,
        userId: entry.userId,
        fromStatus: entry.from ?? undefined,
        toStatus: entry.to,
        action: entry.action,
        comment: (entry as { comment?: string }).comment,
      },
    });
  }

  // Audit logs for app2
  for (const entry of [
    { from: null, to: ApplicationStatus.DRAFT, action: 'Application created', userId: applicant2.id },
    { from: ApplicationStatus.DRAFT, to: ApplicationStatus.SUBMITTED, action: 'Application submitted', userId: applicant2.id },
    { from: ApplicationStatus.SUBMITTED, to: ApplicationStatus.PRE_SCREENING, action: 'Start pre-screening', userId: handler.id },
    { from: ApplicationStatus.PRE_SCREENING, to: ApplicationStatus.AWAITING_ADDITIONAL_INFORMATION, action: 'Request additional information', userId: handler.id, comment: 'Missing: exact CBS socioeconomic variable codes and aggregation method.' },
  ]) {
    await prisma.auditLog.create({
      data: {
        applicationId: app2.id,
        userId: entry.userId,
        fromStatus: entry.from ?? undefined,
        toStatus: entry.to,
        action: entry.action,
        comment: (entry as { comment?: string }).comment,
      },
    });
  }

  console.log('Seed complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
