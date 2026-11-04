import PDFDocument from 'pdfkit';

export interface RegistrationPdfData {
  registrationNumber: string;
  workflowStatus: string;
  isCompleted: boolean;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  registrationSource: string;
  donationType: string;

  organisationName?: string;
  organisationLicense?: string;
  organisationCode?: string;
  bloodCentreName?: string;
  bloodCentreAddress?: string;
  bloodCentrePhone?: string;

  campTitle?: string;
  campCode?: string;
  campVenue?: string;

  donorDetails: {
    fullName?: string;
    gender?: string;
    bloodGroup?: string;
    dateOfBirth?: string;
    calculatedAge?: number;
    maritalStatus?: string;
    nationalIdAadhaarMasked?: string;
    abhaNumber?: string;
    abhaAddress?: string;
    profession?: string;
    donorClub?: string;
    donationWillingness?: string;
    primaryMobile?: string;
    secondaryMobile?: string;
    email?: string;
    address?: string;
    state?: string;
    district?: string;
    city?: string;
    pinCode?: string;
    isRepeatDonor?: boolean;
    lastDonationDate?: string;
    preferredLanguage?: string;
    smsPermission?: boolean;
    callPermission?: boolean;
  };

  counselling: {
    status?: string;
    remarks?: string;
    canIssuePlasma?: boolean;
    deferralType?: string;
    deferralReason?: string;
    reviewedById?: string;
    reviewedByName?: string | null;
    reviewedAt?: Date | string | null;
    answers?: Array<{
      id: number;
      code: string;
      question: string;
      answer: string;
      selectedOptions?: string[];
      remarks?: string;
      isDemoDefault?: boolean;
      staffEdited?: boolean;
    }>;
  };

  screening: {
    status?: string;
    weightKg?: number | null;
    hemoglobin?: number | null;
    bloodGroup?: string | null;
    systolicBp?: number | null;
    diastolicBp?: number | null;
    pulseBpm?: number | null;
    temperatureCelsius?: number | null;
    heightCm?: number | null;
    bothArmsInspected?: boolean | null;
    postDonationTipsGiven?: boolean | null;
    screenedById?: string | null;
    screenedByName?: string | null;
    medicalOfficerId?: string | null;
    medicalOfficerName?: string | null;
    processType?: string | null;
    remarks?: string | null;
    deferralCategory?: string | null;
    deferralReason?: string | null;
    performedAt?: Date | string | null;
  };

  collection: {
    status?: string;
    phlebotomyDateTime?: Date | string | null;
    bagType?: string | null;
    manufacturer?: string | null;
    lotNumber?: string | null;
    segmentNumber?: string | null;
    unitNumber?: string | null;
    barcode?: string | null;
    isLessQuantity?: boolean | null;
    volumeMl?: number | null;
    durationMinutes?: number | null;
    phlebotomistId?: string | null;
    phlebotomistName?: string | null;
    doctorStaffId?: string | null;
    doctorName?: string | null;
    observations?: string | null;
    adverseReaction?: boolean | null;
    adverseReactionDetails?: string | null;
    timeRefreshmentsProvided?: string | null;
    exitTime?: string | null;
    remarks?: string | null;
  };

  consent: {
    consentGiven: boolean;
    recordedAt?: Date | string | null;
    version?: string;
  };
}

export class PdfService {
  /**
   * Generates a formal 2-page A4 printable PDF exactly matching the clinical reference layout.
   * Page 1: Blood Centre Header, Donor Information, Questionnaire 1-18.
   * Page 2: Questionnaire 19-24 (and 25-26), Donor Consent & Signatures,
   *         General Physical Examination (Screening), Medical Officer Decision, Phlebotomy Details.
   */
  public static async generateRegistrationPdf(input: RegistrationPdfData | string): Promise<Buffer> {
    let data: RegistrationPdfData;
    if (typeof input === 'string') {
      const { DonorRegistrationService } = await import('./donorRegistrationService');
      const reg = await DonorRegistrationService.getRegistrationById(input);
      data = reg as any;
    } else {
      data = input;
    }

    if (typeof data.donorDetails === 'string') {
      try { data.donorDetails = JSON.parse(data.donorDetails); } catch {}
    }
    if (data.counselling && typeof data.counselling.answers === 'string') {
      try { data.counselling.answers = JSON.parse(data.counselling.answers); } catch {}
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 28, bottom: 28, left: 32, right: 32 },
        autoFirstPage: true,
        bufferPages: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 595.28;
      const leftMargin = 32;
      const rightMargin = pageWidth - 32;
      const contentWidth = rightMargin - leftMargin; // 531.28

      // Table column coordinates matching reference form
      const colSr = leftMargin; // 32
      const wSr = 30;
      const colQ = colSr + wSr; // 62
      const wQ = 330;
      const colAns = colQ + wQ; // 392
      const wAns = 60;
      const colRem = colAns + wAns; // 452
      const wRem = contentWidth - (wSr + wQ + wAns); // 81.28

      const renderHeader = () => {
        const centreName = data.bloodCentreName || data.organisationName || 'RaktaSetu Blood Centre';
        const centreAddress = data.bloodCentreAddress || 'Maharashtra, India';
        const centrePhone = data.bloodCentrePhone ? `Ph.No. ${data.bloodCentrePhone}` : '';
        const licence = data.organisationLicense ? `Lic.No. ${data.organisationLicense}` : 'Lic.No. —';

        doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold').text(centreName.toUpperCase(), leftMargin, 26, {
          width: contentWidth,
          align: 'center',
        });

        doc.fontSize(7).font('Helvetica').text(`${centreAddress} ${centrePhone}`.trim(), leftMargin, 40, {
          width: contentWidth,
          align: 'center',
        });

        doc.fontSize(9).font('Helvetica-Bold').text('Blood-donor Registration Form', leftMargin, 52, {
          width: contentWidth,
          align: 'center',
        });

        // Top licence and place strip
        doc.fontSize(8).font('Helvetica-Bold').text(licence, leftMargin, 66);
        const placeText = data.campTitle ? `Place: Camp - ${data.campTitle}` : 'Place: Inhouse';
        doc.text(placeText, 250, 66);

        // Reg No & Donation Type Strip
        doc.text(`Registration No.: ${data.registrationNumber}`, leftMargin, 79);

        // Banner for Type of Blood-giving
        const donationType = data.donationType ? data.donationType.charAt(0).toUpperCase() + data.donationType.slice(1).toLowerCase() : 'Voluntary';
        doc.rect(leftMargin + 60, 91, contentWidth - 120, 15).fillAndStroke('#e5e7eb', '#9ca3af');
        doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold').text(
          `Type of Blood-giving: ${donationType}`,
          leftMargin + 60,
          94,
          { width: contentWidth - 120, align: 'center' }
        );

        // Note sentence
        doc.fontSize(6.5).font('Helvetica').text(
          'Note: Please tick ( v ) against the correct information ask for against the following questions honestly. It is absolutely inevitable for the safety of yours and the patient who will receive your blood. This information shall remain confidential.',
          leftMargin,
          111,
          { width: contentWidth, align: 'left' }
        );

        // Donor details lines
        const d = data.donorDetails;
        const curY = 127;

        // Line 1: Donor Name
        doc.fontSize(8).font('Helvetica-Bold').text('Donor Name :', leftMargin, curY);
        doc.font('Helvetica-Bold').text((d.fullName || '').toUpperCase(), leftMargin + 65, curY);
        doc.strokeColor('#000000').lineWidth(0.5).moveTo(leftMargin + 65, curY + 10).lineTo(rightMargin, curY + 10).stroke();

        // Line 2: Date of Birth, Age, M/F, E-Mail
        const curY2 = curY + 15;
        doc.font('Helvetica').text('Date of Birth:', leftMargin, curY2);
        doc.text(d.dateOfBirth ? new Date(d.dateOfBirth).toLocaleDateString('en-IN') : '—', leftMargin + 55, curY2);
        doc.moveTo(leftMargin + 55, curY2 + 10).lineTo(leftMargin + 150, curY2 + 10).stroke();

        doc.text('Age:', leftMargin + 160, curY2);
        doc.text(d.calculatedAge ? `${d.calculatedAge}` : '—', leftMargin + 185, curY2);
        doc.moveTo(leftMargin + 185, curY2 + 10).lineTo(leftMargin + 235, curY2 + 10).stroke();

        doc.text('M/F:', leftMargin + 245, curY2);
        doc.text(d.gender || '—', leftMargin + 270, curY2);
        doc.moveTo(leftMargin + 270, curY2 + 10).lineTo(leftMargin + 325, curY2 + 10).stroke();

        doc.text('E-Mail:', leftMargin + 340, curY2);
        doc.text(d.email || '—', leftMargin + 375, curY2);
        doc.moveTo(leftMargin + 375, curY2 + 10).lineTo(rightMargin, curY2 + 10).stroke();

        // Line 3: Address
        const curY3 = curY2 + 15;
        doc.text('Address:', leftMargin, curY3);
        const fullAddr = `${d.address || ''}, ${d.city || ''}`.trim() || '—';
        doc.text(fullAddr, leftMargin + 50, curY3, { width: rightMargin - (leftMargin + 50), height: 10 });
        doc.moveTo(leftMargin + 50, curY3 + 10).lineTo(rightMargin, curY3 + 10).stroke();

        // Line 4: Tel-No, Mobile No, Occupation
        const curY4 = curY3 + 15;
        doc.text('Tel-No:', leftMargin, curY4);
        doc.text(d.secondaryMobile || '—', leftMargin + 40, curY4);
        doc.moveTo(leftMargin + 40, curY4 + 10).lineTo(leftMargin + 150, curY4 + 10).stroke();

        doc.text('Mobile No:', leftMargin + 165, curY4);
        doc.text(d.primaryMobile ? d.primaryMobile.slice(-10) : '—', leftMargin + 215, curY4);
        doc.moveTo(leftMargin + 215, curY4 + 10).lineTo(leftMargin + 320, curY4 + 10).stroke();

        doc.text('Occupation:', leftMargin + 335, curY4);
        doc.text(d.profession || '—', leftMargin + 395, curY4);
        doc.moveTo(leftMargin + 395, curY4 + 10).lineTo(rightMargin, curY4 + 10).stroke();

        doc.y = curY4 + 16;
      };

      const renderTableHeading = (startY: number) => {
        doc.strokeColor('#000000').lineWidth(0.8);
        doc.rect(leftMargin, startY, contentWidth, 18).stroke();

        doc.moveTo(colQ, startY).lineTo(colQ, startY + 18).stroke();
        doc.moveTo(colAns, startY).lineTo(colAns, startY + 18).stroke();
        doc.moveTo(colRem, startY).lineTo(colRem, startY + 18).stroke();

        doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
        doc.text('Sr.No.', colSr + 2, startY + 5, { width: wSr - 4, align: 'center' });
        doc.text('Question', colQ + 4, startY + 5, { width: wQ - 8, align: 'center' });
        doc.text('Answer', colAns + 2, startY + 5, { width: wAns - 4, align: 'center' });
        doc.text('Remarks', colRem + 2, startY + 5, { width: wRem - 4, align: 'center' });
      };

      // -----------------------------------------------------------------------
      // PAGE 1: Header + Donor Details + Questions 1 to 18
      // -----------------------------------------------------------------------
      renderHeader();

      let tableTopY = doc.y + 2;
      renderTableHeading(tableTopY);
      let currentY = tableTopY + 18;

      const allAnswers = data.counselling.answers || [];

      // Render questions 1 through 18 on Page 1
      for (let i = 0; i < 18 && i < allAnswers.length; i++) {
        const q = allAnswers[i];
        const srNo = `${i + 1}`;
        const qText = q.question || '';
        const ansText = q.answer || 'NO';
        const remText = q.remarks || '';

        // Calculate height for question text
        doc.fontSize(7).font('Helvetica');
        const textH = doc.heightOfString(qText, { width: wQ - 8 });
        const rowHeight = Math.max(textH + 4, 15);

        // Draw outer borders and column divider lines
        doc.strokeColor('#000000').lineWidth(0.5);
        doc.rect(leftMargin, currentY, contentWidth, rowHeight).stroke();
        doc.moveTo(colQ, currentY).lineTo(colQ, currentY + rowHeight).stroke();
        doc.moveTo(colAns, currentY).lineTo(colAns, currentY + rowHeight).stroke();
        doc.moveTo(colRem, currentY).lineTo(colRem, currentY + rowHeight).stroke();

        // Render text
        doc.fillColor('#000000');
        doc.font('Helvetica-Bold').fontSize(7).text(srNo, colSr + 2, currentY + 3, { width: wSr - 4, align: 'center' });
        doc.font('Helvetica').fontSize(6.8).text(qText, colQ + 4, currentY + 3, { width: wQ - 8, align: 'left' });
        doc.font('Helvetica-Bold').fontSize(7.5).text(ansText, colAns + 2, currentY + 3, { width: wAns - 4, align: 'center' });
        if (remText) {
          doc.font('Helvetica').fontSize(6.5).text(remText, colRem + 2, currentY + 3, { width: wRem - 4, align: 'left' });
        }

        currentY += rowHeight;
      }

      // -----------------------------------------------------------------------
      // PAGE 2: Questions 19 to 24 (and 25-26), Consent, Signatures, Examination & Phlebotomy
      // -----------------------------------------------------------------------
      doc.addPage();

      let p2Y = 28;
      renderTableHeading(p2Y);
      currentY = p2Y + 18;

      // Render remaining questions (19 to end)
      for (let i = 18; i < allAnswers.length; i++) {
        const q = allAnswers[i];
        const srNo = `${i + 1}`;
        const qText = q.question || '';
        const ansText = q.answer || 'NO';
        const remText = q.remarks || '';

        doc.fontSize(7).font('Helvetica');
        const textH = doc.heightOfString(qText, { width: wQ - 8 });
        const rowHeight = Math.max(textH + 4, 15);

        doc.strokeColor('#000000').lineWidth(0.5);
        doc.rect(leftMargin, currentY, contentWidth, rowHeight).stroke();
        doc.moveTo(colQ, currentY).lineTo(colQ, currentY + rowHeight).stroke();
        doc.moveTo(colAns, currentY).lineTo(colAns, currentY + rowHeight).stroke();
        doc.moveTo(colRem, currentY).lineTo(colRem, currentY + rowHeight).stroke();

        doc.fillColor('#000000');
        doc.font('Helvetica-Bold').fontSize(7).text(srNo, colSr + 2, currentY + 3, { width: wSr - 4, align: 'center' });
        doc.font('Helvetica').fontSize(6.8).text(qText, colQ + 4, currentY + 3, { width: wQ - 8, align: 'left' });
        doc.font('Helvetica-Bold').fontSize(7.5).text(ansText, colAns + 2, currentY + 3, { width: wAns - 4, align: 'center' });
        if (remText) {
          doc.font('Helvetica').fontSize(6.5).text(remText, colRem + 2, currentY + 3, { width: wRem - 4, align: 'left' });
        }

        currentY += rowHeight;
      }

      // Past history strip
      currentY += 8;
      doc.fontSize(7.5).font('Helvetica-Bold').text('If yes, then how many times?:', leftMargin, currentY);
      doc.strokeColor('#000000').lineWidth(0.5).moveTo(leftMargin + 115, currentY + 9).lineTo(leftMargin + 190, currentY + 9).stroke();

      doc.text('When did you give blood last?:', leftMargin + 215, currentY);
      const lastDon = data.donorDetails.lastDonationDate || '—';
      doc.font('Helvetica').text(lastDon, leftMargin + 325, currentY);
      doc.moveTo(leftMargin + 325, currentY + 9).lineTo(rightMargin, currentY + 9).stroke();

      // Consent Section
      currentY += 16;
      doc.font('Helvetica-Bold').fontSize(7.5).text('Consent :', leftMargin, currentY);
      const consentText =
        'I prohibit any information provided by me or about my giving of blood to be disclosed to any individual or government agency without my prior permission and I give my consent to the blood centre to issue my blood and blood components to the patients after fractionation and derivation of the essential plasma derived medicines there-form.';
      doc.font('Helvetica').fontSize(6.5).text(consentText, leftMargin + 45, currentY, {
        width: rightMargin - (leftMargin + 45),
        align: 'justify',
      });

      // Date / Time / Signatures
      currentY += 28;
      doc.fontSize(7.5).font('Helvetica-Bold').text('Date', leftMargin, currentY);
      doc.text(':', leftMargin + 35, currentY);
      doc.font('Helvetica').text(new Date(data.createdAt).toLocaleDateString('en-IN'), leftMargin + 45, currentY);
      doc.moveTo(leftMargin + 45, currentY + 9).lineTo(leftMargin + 120, currentY + 9).stroke();

      doc.font('Helvetica-Bold').text('Time :', leftMargin + 140, currentY);
      doc.font('Helvetica').text(new Date(data.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), leftMargin + 170, currentY);
      doc.moveTo(leftMargin + 170, currentY + 9).lineTo(leftMargin + 225, currentY + 9).stroke();

      doc.text("P.R.O.'s Signature", leftMargin + 260, currentY);
      doc.moveTo(leftMargin + 235, currentY + 9).lineTo(leftMargin + 360, currentY + 9).stroke();

      doc.text("Blood-giver's Signature", rightMargin - 110, currentY);
      doc.moveTo(rightMargin - 130, currentY + 9).lineTo(rightMargin, currentY + 9).stroke();

      // Divider line
      currentY += 16;
      doc.strokeColor('#000000').lineWidth(0.8).moveTo(leftMargin, currentY).lineTo(rightMargin, currentY).stroke();

      // Section: General Physical Examination
      currentY += 5;
      doc.fontSize(7).font('Helvetica').text('(TO BE FILLED IN BY THE BLOOD BANK STAFF)', leftMargin, currentY);
      doc.fontSize(9).font('Helvetica-Bold').text('GENERAL PHYSICAL EXAMINATION', leftMargin + 180, currentY);

      const sc = data.screening;
      currentY += 16;
      // Weight, Pulse, Hb, Time, Blood Pressure
      doc.fontSize(8).font('Helvetica').text('Weight:', leftMargin, currentY);
      doc.text(sc.weightKg ? `${sc.weightKg}` : '', leftMargin + 35, currentY);
      doc.text('Kg', leftMargin + 65, currentY);
      doc.moveTo(leftMargin + 32, currentY + 9).lineTo(leftMargin + 63, currentY + 9).stroke();

      doc.text('Pulse:', leftMargin + 95, currentY);
      doc.text(sc.pulseBpm ? `${sc.pulseBpm}` : '', leftMargin + 125, currentY);
      doc.text('/min', leftMargin + 155, currentY);
      doc.moveTo(leftMargin + 122, currentY + 9).lineTo(leftMargin + 153, currentY + 9).stroke();

      doc.text('Hb:', leftMargin + 185, currentY);
      doc.text(sc.hemoglobin ? `${sc.hemoglobin}` : '', leftMargin + 205, currentY);
      doc.text('gm%', leftMargin + 235, currentY);
      doc.moveTo(leftMargin + 202, currentY + 9).lineTo(leftMargin + 233, currentY + 9).stroke();

      doc.text('Time :', leftMargin + 275, currentY);
      doc.text(sc.performedAt ? new Date(sc.performedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—', leftMargin + 305, currentY);
      doc.moveTo(leftMargin + 302, currentY + 9).lineTo(leftMargin + 355, currentY + 9).stroke();

      doc.text('Blood Pressure :', leftMargin + 375, currentY);
      const bpStr = sc.systolicBp && sc.diastolicBp ? `${sc.systolicBp}/${sc.diastolicBp}` : '—';
      doc.text(bpStr, leftMargin + 450, currentY);
      doc.text('mm/hg', rightMargin - 30, currentY);
      doc.moveTo(leftMargin + 448, currentY + 9).lineTo(rightMargin - 32, currentY + 9).stroke();

      // Temperature, Done By
      currentY += 16;
      doc.text('Temperature:', leftMargin, currentY);
      doc.text(sc.temperatureCelsius ? `${sc.temperatureCelsius}` : '—', leftMargin + 65, currentY);
      doc.text('Celsius', leftMargin + 105, currentY);
      doc.moveTo(leftMargin + 62, currentY + 9).lineTo(leftMargin + 102, currentY + 9).stroke();

      doc.text('Done By:', leftMargin + 185, currentY);
      const doneByName = sc.screenedByName || '—';
      doc.text(doneByName, leftMargin + 230, currentY);
      doc.moveTo(leftMargin + 228, currentY + 9).lineTo(rightMargin, currentY + 9).stroke();

      // Reason for deferral
      currentY += 15;
      doc.text('Reason for deferral:', leftMargin, currentY);
      const defReason = sc.deferralReason || sc.deferralCategory || '-';
      doc.text(defReason, leftMargin + 95, currentY);
      doc.moveTo(leftMargin + 92, currentY + 9).lineTo(rightMargin, currentY + 9).stroke();

      // Accept / Date & Time / Medical Officer Signature
      currentY += 18;
      const isFit = sc.status === 'FIT';
      doc.font('Helvetica-Bold').text('Accept', leftMargin, currentY);
      doc.rect(leftMargin + 40, currentY - 1, 12, 12).stroke();
      if (isFit) {
        doc.text('v', leftMargin + 43, currentY);
      }

      doc.font('Helvetica').text('Date & Time:', leftMargin + 85, currentY);
      const moTimeStr = sc.performedAt ? new Date(sc.performedAt).toLocaleString('en-IN') : '—';
      doc.text(moTimeStr, leftMargin + 145, currentY);
      doc.moveTo(leftMargin + 142, currentY + 9).lineTo(leftMargin + 280, currentY + 9).stroke();

      const moName = sc.medicalOfficerName ? `Dr. ${sc.medicalOfficerName}` : 'Medical Officer';
      doc.text(`Signature of Medical Officer (${moName})`, leftMargin + 310, currentY);
      doc.moveTo(leftMargin + 305, currentY + 9).lineTo(rightMargin, currentY + 9).stroke();

      // Phlebotomy Details Section
      currentY += 18;
      doc.strokeColor('#000000').lineWidth(0.8).moveTo(leftMargin, currentY).lineTo(rightMargin, currentY).stroke();

      currentY += 5;
      doc.fontSize(9).font('Helvetica-Bold').text('Phlebotomy details:', leftMargin, currentY);

      const col = data.collection;
      const colBoxY = currentY + 12;
      const colBoxW = 120;
      const colBoxH = 32;

      // Draw Blood Unit Box on the right
      doc.rect(rightMargin - colBoxW, colBoxY, colBoxW, colBoxH).stroke();
      doc.fontSize(7.5).font('Helvetica-Bold').text('Blood Unit No:', rightMargin - colBoxW + 5, colBoxY + 4);
      if (col.unitNumber) {
        doc.fontSize(8.5).font('Helvetica-Bold').text(col.unitNumber, rightMargin - colBoxW + 5, colBoxY + 16);
      }

      // Line 1: Duration, Volume Collected
      doc.fontSize(7.5).font('Helvetica').text('Duration of Phlebotomy', leftMargin, colBoxY + 4);
      doc.text(col.durationMinutes ? `${col.durationMinutes}` : '', leftMargin + 105, colBoxY + 4);
      doc.text('min', leftMargin + 135, colBoxY + 4);
      doc.moveTo(leftMargin + 102, colBoxY + 13).lineTo(leftMargin + 132, colBoxY + 13).stroke();

      doc.text('Volume Collected :', leftMargin + 175, colBoxY + 4);
      doc.text(col.volumeMl ? `${col.volumeMl}` : '', leftMargin + 255, colBoxY + 4);
      doc.text('ml', leftMargin + 285, colBoxY + 4);
      doc.moveTo(leftMargin + 252, colBoxY + 13).lineTo(leftMargin + 282, colBoxY + 13).stroke();

      // Line 2: Bag type, Segment No
      const line2Y = colBoxY + 18;
      doc.text('Bag type :', leftMargin, line2Y);
      doc.text(col.bagType || '', leftMargin + 50, line2Y);
      doc.moveTo(leftMargin + 48, line2Y + 9).lineTo(leftMargin + 140, line2Y + 9).stroke();

      doc.text('Segment No:', leftMargin + 175, line2Y);
      doc.text(col.segmentNumber || '', leftMargin + 235, line2Y);
      doc.moveTo(leftMargin + 232, line2Y + 9).lineTo(leftMargin + 330, line2Y + 9).stroke();

      // Line 3: Phlebotomist, Signature, Ant reaction
      const line3Y = colBoxY + 36;
      doc.text('Phlebotomist :', leftMargin, line3Y);
      doc.text(col.phlebotomistName || '', leftMargin + 65, line3Y);
      doc.moveTo(leftMargin + 62, line3Y + 9).lineTo(leftMargin + 170, line3Y + 9).stroke();

      doc.text('Signature :', leftMargin + 180, line3Y);
      doc.moveTo(leftMargin + 225, line3Y + 9).lineTo(leftMargin + 310, line3Y + 9).stroke();

      doc.text('Ant reaction:', leftMargin + 325, line3Y);
      const antStr = col.adverseReaction ? `Yes (${col.adverseReactionDetails || 'Managed'})` : 'No';
      doc.text(antStr, leftMargin + 380, line3Y);
      doc.moveTo(leftMargin + 378, line3Y + 9).lineTo(rightMargin, line3Y + 9).stroke();

      // Line 4: Time of Phlebotomy, Time of refreshment, Time of Exit
      const line4Y = line3Y + 16;
      doc.text('Time of Phlebotomy :', leftMargin, line4Y);
      doc.text(col.phlebotomyDateTime ? new Date(col.phlebotomyDateTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '', leftMargin + 88, line4Y);
      doc.moveTo(leftMargin + 85, line4Y + 9).lineTo(leftMargin + 160, line4Y + 9).stroke();

      doc.text('Time of refreshment:', leftMargin + 170, line4Y);
      doc.text(col.timeRefreshmentsProvided || '', leftMargin + 255, line4Y);
      doc.moveTo(leftMargin + 252, line4Y + 9).lineTo(leftMargin + 330, line4Y + 9).stroke();

      doc.text('Time of Exit:', leftMargin + 340, line4Y);
      doc.text(col.exitTime || '', leftMargin + 395, line4Y);
      doc.moveTo(leftMargin + 392, line4Y + 9).lineTo(rightMargin, line4Y + 9).stroke();

      // Add Page Numbers and Registration Number Footers to both pages
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fillColor('#6b7280').fontSize(7).font('Helvetica');
        const footerY = 802;
        doc.text(`Reg #: ${data.registrationNumber}`, leftMargin, footerY, { lineBreak: false });
        doc.text(`Page ${i + 1} of ${totalPages}`, rightMargin - 60, footerY, { align: 'right', width: 60, lineBreak: false });
      }

      doc.end();
    });
  }
}
