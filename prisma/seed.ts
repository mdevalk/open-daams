import { PrismaClient, UserRole, ApplicationType, ApplicationStatus } from '@prisma/client';
import { addMonths, addWeeks, subDays } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  // Seed users
  const applicant1 = await prisma.user.upsert({
    where: { email: 'researcher@umcu.nl' },
    update: {},
    create: {
      name: 'Dr. A. de Vries',
      email: 'researcher@umcu.nl',
      role: UserRole.APPLICANT,
      organisation: 'UMC Utrecht',
    },
  });

  const applicant2 = await prisma.user.upsert({
    where: { email: 'analyst@rivm.nl' },
    update: {},
    create: {
      name: 'M. Jansen',
      email: 'analyst@rivm.nl',
      role: UserRole.APPLICANT,
      organisation: 'RIVM',
    },
  });

  const handler = await prisma.user.upsert({
    where: { email: 'casehandler@hdab.nl' },
    update: {},
    create: {
      name: 'S. Bakker',
      email: 'casehandler@hdab.nl',
      role: UserRole.CASE_HANDLER,
      organisation: 'HDAB-NL',
    },
  });

  const decisionMaker = await prisma.user.upsert({
    where: { email: 'director@hdab.nl' },
    update: {},
    create: {
      name: 'P. van den Berg',
      email: 'director@hdab.nl',
      role: UserRole.DECISION_MAKER,
      organisation: 'HDAB-NL',
    },
  });

  // Seed applications
  const app1 = await prisma.application.upsert({
    where: { referenceNumber: 'HDAB-2025-0001' },
    update: {},
    create: {
      referenceNumber: 'HDAB-2025-0001',
      type: ApplicationType.DATA_ACCESS_APPLICATION,
      status: ApplicationStatus.UNDER_ASSESSMENT,
      applicantId: applicant1.id,
      caseHandlerId: handler.id,
      title: 'Cardiovascular risk factors in Dutch primary care 2015-2024',
      projectDescription: 'Retrospective cohort study analysing the long-term trends in cardiovascular risk factor prevalence using routine primary care data.',
      purposeCategory: 'SCIENTIFIC_RESEARCH',
      requestedDatasets: ['GP_ELECTRONIC_RECORDS', 'MEDICATION_DISPENSING'],
      requestedVariables: 'Age, sex, BMI, blood pressure, HbA1c, lipid panel, medication records (ATC codes C01-C10)',
      studyPopulation: 'Adults aged 18-80 registered in Dutch general practices',
      inclusionCriteria: 'Age 18-80, registered ≥1 year, at least one cardiovascular risk factor recorded',
      exclusionCriteria: 'Incomplete registration, opt-out from research use',
      dataStartDate: new Date('2015-01-01'),
      dataEndDate: new Date('2024-12-31'),
      projectStartDate: new Date('2025-03-01'),
      projectEndDate: new Date('2027-02-28'),
      legalBasis: 'EHDS Art. 34(1)(a) – scientific research',
      dataProcessingCountry: 'NL',
      isCrossBorder: false,
      submittedAt: subDays(new Date(), 35),
      decisionDeadline: addMonths(subDays(new Date(), 35), 2),
    },
  });

  const app2 = await prisma.application.upsert({
    where: { referenceNumber: 'HDAB-2025-0002' },
    update: {},
    create: {
      referenceNumber: 'HDAB-2025-0002',
      type: ApplicationType.DATA_REQUEST,
      status: ApplicationStatus.INCOMPLETE,
      applicantId: applicant2.id,
      caseHandlerId: handler.id,
      title: 'COVID-19 vaccination coverage by municipality 2021-2023',
      projectDescription: 'Aggregated statistical analysis of COVID-19 vaccination uptake stratified by municipality, age group, and socioeconomic status.',
      purposeCategory: 'PUBLIC_HEALTH',
      requestedDatasets: ['NATIONAL_IMMUNISATION_REGISTER'],
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
      isCrossBorder: false,
      submittedAt: subDays(new Date(), 20),
      incompleteDeadline: addWeeks(subDays(new Date(), 5), 4),
      decisionDeadline: addMonths(subDays(new Date(), 20), 2),
    },
  });

  const app3 = await prisma.application.upsert({
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
      requestedDatasets: ['MENTAL_HEALTH_CLAIMS', 'GP_ELECTRONIC_RECORDS'],
      requestedVariables: 'Age, sex, diagnosis codes (ICD-10 F codes), referral pathway, treatment episodes',
      studyPopulation: 'Adolescents and young adults aged 12-25',
      inclusionCriteria: 'Age 12-25, at least one contact with mental health services',
      exclusionCriteria: 'Opt-out from research use',
      dataStartDate: new Date('2019-01-01'),
      dataEndDate: new Date('2024-12-31'),
      projectStartDate: new Date('2025-06-01'),
      projectEndDate: new Date('2027-05-31'),
      legalBasis: 'EHDS Art. 34(1)(a) – scientific research',
      dataProcessingCountry: 'NL',
      isCrossBorder: false,
    },
  });

  // Audit logs
  await prisma.auditLog.createMany({
    data: [
      {
        applicationId: app1.id,
        userId: applicant1.id,
        fromStatus: null,
        toStatus: ApplicationStatus.DRAFT,
        action: 'Application created',
      },
      {
        applicationId: app1.id,
        userId: applicant1.id,
        fromStatus: ApplicationStatus.DRAFT,
        toStatus: ApplicationStatus.SUBMITTED,
        action: 'Application submitted',
      },
      {
        applicationId: app1.id,
        userId: handler.id,
        fromStatus: ApplicationStatus.SUBMITTED,
        toStatus: ApplicationStatus.ADMISSIBILITY_CHECK,
        action: 'Admissibility check started',
      },
      {
        applicationId: app1.id,
        userId: handler.id,
        fromStatus: ApplicationStatus.ADMISSIBILITY_CHECK,
        toStatus: ApplicationStatus.UNDER_ASSESSMENT,
        action: 'Application declared admissible',
        comment: 'All required fields complete. Proceeding to substantive assessment.',
      },
      {
        applicationId: app2.id,
        userId: applicant2.id,
        fromStatus: null,
        toStatus: ApplicationStatus.DRAFT,
        action: 'Application created',
      },
      {
        applicationId: app2.id,
        userId: applicant2.id,
        fromStatus: ApplicationStatus.DRAFT,
        toStatus: ApplicationStatus.SUBMITTED,
        action: 'Application submitted',
      },
      {
        applicationId: app2.id,
        userId: handler.id,
        fromStatus: ApplicationStatus.SUBMITTED,
        toStatus: ApplicationStatus.ADMISSIBILITY_CHECK,
        action: 'Admissibility check started',
      },
      {
        applicationId: app2.id,
        userId: handler.id,
        fromStatus: ApplicationStatus.ADMISSIBILITY_CHECK,
        toStatus: ApplicationStatus.INCOMPLETE,
        action: 'Application returned as incomplete',
        comment: 'Missing: specification of CBS socioeconomic quintile variable. Please provide the exact variable codes and any aggregation method.',
      },
    ],
    skipDuplicates: true,
  });

  console.log('Seed complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
