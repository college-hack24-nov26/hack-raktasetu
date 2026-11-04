'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch } from '../../config/api';

export default function HospitalPortalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Hospital Membership State
  const [memberships, setMemberships] = useState<any[]>([]);
  const [activeHospitalIndex, setActiveHospitalIndex] = useState(0);

  // Dashboard Data State
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'deliveries' | 'requests' | 'discrepancies' | 'custody'>('deliveries');

  // Receipt Modal State
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<any | null>(null);
  const [receiptOutcomes, setReceiptOutcomes] = useState<Record<string, { outcome: string; notes: string }>>({});
  const [receiptNotes, setReceiptNotes] = useState('');
  const [submittingReceipt, setSubmittingReceipt] = useState(false);

  // Request Detail Modal State
  const [selectedRequestDetail, setSelectedRequestDetail] = useState<any | null>(null);

  // Custody Trace State
  const [custodyUnitId, setCustodyUnitId] = useState('');
  const [custodyHistory, setCustodyHistory] = useState<any | null>(null);
  const [custodyLoading, setCustodyLoading] = useState(false);

  const activeHospital = memberships[activeHospitalIndex] || null;

  // 1. Authenticate and load hospital memberships
  useEffect(() => {
    async function loadMemberships() {
      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('raktasetu_token');
        if (!token) {
          router.push('/login');
          return;
        }

        const res = await authFetch('/organisations/me/memberships');
        if (!res.ok) {
          throw new Error('Failed to load user organisation memberships.');
        }

        const data = await res.json();
        const allMemberships: any[] = data.data || [];

        // Filter for receiving facility or hospital-permitted organisations
        const hospitalMemberships = allMemberships.filter(
          (m) => m.organisation?.type === 'RECEIVING_FACILITY' || m.role === 'ORG_ADMIN' || m.role === 'CLINICAL_STAFF'
        );

        if (hospitalMemberships.length === 0) {
          setError('You do not hold an authorized hospital facility staff role. Please contact your hospital administrator.');
          setMemberships([]);
          return;
        }

        setMemberships(hospitalMemberships);
      } catch (err: any) {
        setError(err.message || 'Error authenticating hospital staff session.');
      } finally {
        setLoading(false);
      }
    }

    loadMemberships();
  }, [router]);

  // 2. Fetch hospital dashboard for active hospital
  const fetchDashboardData = async () => {
    if (!activeHospital) return;
    try {
      setError(null);
      const res = await authFetch(`/api/v1/hospital/dashboard?organisationId=${activeHospital.organisationId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to retrieve hospital dashboard.');
      }
      setDashboardData(data.data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (activeHospital) {
      fetchDashboardData();
    }
  }, [activeHospitalIndex, memberships]);

  // Handle Receipt Submission
  const handleAcknowledgeReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForReceipt || !activeHospital) return;

    setSubmittingReceipt(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const receipts = selectedOrderForReceipt.items.map((item: any) => {
        const itemState = receiptOutcomes[item.componentUnitId] || { outcome: 'VERIFIED_INTACT', notes: '' };
        return {
          componentUnitId: item.componentUnitId,
          outcome: itemState.outcome,
          notes: itemState.notes.trim() || undefined,
        };
      });

      const res = await authFetch('/api/v1/hospital/issues/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisationId: activeHospital.organisationId,
          issueOrderId: selectedOrderForReceipt.id,
          receipts,
          notes: receiptNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to acknowledge receipt');
      }

      setSuccessMsg(`Receipt successfully confirmed for Order #${selectedOrderForReceipt.orderNumber}!`);
      setSelectedOrderForReceipt(null);
      setReceiptOutcomes({});
      setReceiptNotes('');
      fetchDashboardData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingReceipt(false);
    }
  };

  // Handle Custody Lookup
  const handleLookupCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custodyUnitId.trim() || !activeHospital) return;

    setCustodyLoading(true);
    setCustodyHistory(null);
    setError(null);

    try {
      const res = await authFetch(
        `/api/v1/hospital/components/${custodyUnitId.trim()}/custody?organisationId=${activeHospital.organisationId}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Custody record not found or access restricted.');
      }
      setCustodyHistory(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCustodyLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-[#B91C32] rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-600">Verifying Hospital Facility Authorisation...</p>
        </div>
      </div>
    );
  }

  if (!activeHospital) {
    return (
      <div className="max-w-xl mx-auto my-16 px-4">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            ⚠️
          </div>
          <h2 className="text-lg font-black text-slate-900">Hospital Facility Role Required</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            {error || 'You do not hold an active role in a verified receiving facility (hospital). To view blood bank orders and patient deliveries, log in with an authorized hospital staff account.'}
          </p>
          <div className="pt-2">
            <Link
              href="/organisation/login"
              className="inline-block px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs"
            >
              Institutional Login Portal →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const summary = dashboardData?.summary || {
    totalRequests: 0,
    awaitingResponse: 0,
    inProgress: 0,
    dispatchedInTransit: 0,
    receivedIntact: 0,
    discrepantOrders: 0,
  };

  const orders = dashboardData?.orders || [];
  const requests = dashboardData?.requests || [];
  const allDiscrepancies = orders.flatMap((o: any) =>
    (o.discrepancies || []).map((d: any) => ({ ...d, orderNumber: o.orderNumber }))
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Top Banner / Breadcrumb */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
            🏥
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Hospital Receiving Facility
              </span>
              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded">
                Verified
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-black text-slate-900 truncate">
              {activeHospital.organisationName || activeHospital.organisation?.name}
            </h1>
          </div>
        </div>

        {/* Facility Switcher if member of multiple hospitals */}
        <div className="flex items-center gap-2">
          {memberships.length > 1 && (
            <select
              value={activeHospitalIndex}
              onChange={(e) => setActiveHospitalIndex(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
            >
              {memberships.map((m, idx) => (
                <option key={m.membershipId} value={idx}>
                  {m.organisationName || m.organisation?.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={fetchDashboardData}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Error / Success Feedback Banners */}
        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} className="font-bold ml-2">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <span>✅ {successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="font-bold ml-2">✕</button>
          </div>
        )}

        {/* Operational KPI Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Awaiting Allocation
            </span>
            <div className="text-xl sm:text-2xl font-black text-amber-950 mt-1">
              {summary.awaitingResponse}
            </div>
            <span className="text-[10px] text-amber-700 font-medium">Pending blood bank</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              In Progress
            </span>
            <div className="text-xl sm:text-2xl font-black text-indigo-950 mt-1">
              {summary.inProgress}
            </div>
            <span className="text-[10px] text-indigo-700 font-medium">Stock reserved/preparing</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-blue-200 bg-blue-50/20 shadow-xs">
            <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">
              In Transit
            </span>
            <div className="text-xl sm:text-2xl font-black text-blue-950 mt-1">
              {summary.dispatchedInTransit}
            </div>
            <span className="text-[10px] text-blue-700 font-medium">Awaiting intake verification</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
              Received Intact
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-950 mt-1">
              {summary.receivedIntact}
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">Verified in facility</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-xs">
            <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
              Discrepancies
            </span>
            <div className="text-xl sm:text-2xl font-black text-rose-950 mt-1">
              {summary.discrepantOrders}
            </div>
            <span className="text-[10px] text-rose-700 font-medium">Cold-chain / damaged</span>
          </div>
        </div>

        {/* Task-oriented Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('deliveries')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'deliveries'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <span>🚚 Incoming Deliveries &amp; Receipt</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'deliveries' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {orders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'requests'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <span>📋 Admitted Patient Requests</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'requests' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {requests.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('discrepancies')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'discrepancies'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <span>⚠️ Delivery Discrepancies</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'discrepancies' ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-800'}`}>
              {allDiscrepancies.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('custody')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'custody'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <span>🔍 Component Custody Trail</span>
          </button>
        </div>

        {/* TAB 1: DELIVERIES & RECEIPT ACKNOWLEDGEMENT */}
        {activeTab === 'deliveries' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Blood Bank Shipments to {activeHospital.organisationName}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Track dispatch status, courier transport temperature, and record strict hospital receipt verification.
                </p>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                <span className="text-3xl">📦</span>
                <p className="font-bold text-slate-600">No blood bank delivery orders recorded yet</p>
                <p className="text-slate-400">
                  When a blood bank issues units to this facility, the delivery manifest will appear here for intake verification.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {orders.map((order: any) => {
                  const isDispatched = order.status === 'DISPATCHED' || order.status === 'PARTIALLY_RECEIVED';
                  const isReceived = order.status === 'RECEIVED';
                  const isDiscrepant = order.status === 'RECEIVED_WITH_DISCREPANCIES';

                  return (
                    <div key={order.id} className="p-5 hover:bg-slate-50/70 transition-all space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
                            {order.orderNumber}
                          </span>
                          <span
                            className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                              order.status === 'AUTHORISED'
                                ? 'bg-amber-100 text-amber-800'
                                : order.status === 'DISPATCHED'
                                ? 'bg-blue-100 text-blue-800 animate-pulse'
                                : order.status === 'RECEIVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : order.status === 'RECEIVED_WITH_DISCREPANCIES'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            ● {order.status}
                          </span>
                          {order.request && (
                            <span className="text-[11px] font-mono font-bold text-slate-500">
                              Linked Request #{order.request.id.slice(0, 8)}
                            </span>
                          )}
                        </div>

                        {/* Action: Acknowledge Receipt */}
                        {isDispatched && (
                          <button
                            onClick={() => {
                              setSelectedOrderForReceipt(order);
                              const initial: Record<string, { outcome: string; notes: string }> = {};
                              order.items.forEach((item: any) => {
                                initial[item.componentUnitId] = { outcome: 'VERIFIED_INTACT', notes: '' };
                              });
                              setReceiptOutcomes(initial);
                            }}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <span>📥</span>
                            <span>Acknowledge Hospital Receipt</span>
                          </button>
                        )}
                      </div>

                      {/* Shipment & Transport Metadata */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-100 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Issuing Blood Bank</span>
                          <div className="font-bold text-slate-900 mt-0.5">
                            {order.issuingOrganisation?.name} ({order.issuingOrganisation?.orgCode})
                          </div>
                          <div className="text-slate-500 text-[11px]">
                            📞 {order.issuingOrganisation?.phone || 'Contact on file'}
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Transport Logistics</span>
                          {order.transportDetails ? (
                            <div className="mt-0.5 space-y-0.5">
                              <div><strong>Carrier:</strong> {order.transportDetails.courierName} ({order.transportDetails.vehicleNumber})</div>
                              <div><strong>Cold Box Temp:</strong> {order.transportDetails.coldBoxTempCelsius}°C</div>
                            </div>
                          ) : (
                            <div className="text-slate-400 mt-0.5">Awaiting dispatch confirmation</div>
                          )}
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Components in Shipment</span>
                          <div className="font-bold text-slate-900 mt-0.5">
                            {order.items.length} Component Unit(s)
                          </div>
                          <div className="text-[11px] font-mono text-slate-600">
                            {order.items.map((i: any) => i.componentUnit?.componentCode).join(', ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ADMITTED PATIENT REQUESTS */}
        {activeTab === 'requests' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Patient Blood Requests Admitted to {activeHospital.organisationName}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Requests submitted by or on behalf of patients admitted at this receiving facility
                </p>
              </div>
            </div>

            {requests.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                <span className="text-3xl">📋</span>
                <p className="font-bold text-slate-600">No admitted patient requests recorded</p>
                <p className="text-slate-400">
                  When patients submit requests selecting this hospital, they will automatically appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {requests.map((req: any) => (
                  <div key={req.id} className="p-5 hover:bg-slate-50/70 transition-all space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-md">
                          {req.requestReference}
                        </span>
                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                            req.fulfillmentStatus === 'OPEN'
                              ? 'bg-amber-100 text-amber-800'
                              : req.fulfillmentStatus === 'STOCK_RESERVED'
                              ? 'bg-indigo-100 text-indigo-800'
                              : req.fulfillmentStatus === 'PREPARING'
                              ? 'bg-blue-100 text-blue-800'
                              : req.fulfillmentStatus === 'DISPATCHED'
                              ? 'bg-sky-100 text-sky-800'
                              : req.fulfillmentStatus === 'FULFILLED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          ● {req.fulfillmentStatus}
                        </span>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {req.urgency} URGENCY
                        </span>
                      </div>

                      <button
                        onClick={() => setSelectedRequestDetail(req)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
                      >
                        🔍 Details
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50/60 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Patient</span>
                        <div className="font-bold text-slate-900 mt-0.5">{req.patientName}</div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Clinical Requirements</span>
                        <div className="font-bold text-slate-900 mt-0.5">
                          {req.component} • <span className="text-[#B91C32]">{req.bloodGroup}</span> ({req.unitsRequested} Unit)
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Designated Bank</span>
                        <div className="font-medium text-slate-800 mt-0.5">{req.designatedBloodBank}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DISCREPANCIES */}
        {activeTab === 'discrepancies' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Transport Discrepancies &amp; Cold-Chain Exceptions
                </h3>
                <p className="text-[11px] text-slate-500">
                  Documented exceptions during facility receiving intake (damaged packaging, temperature excursions)
                </p>
              </div>
            </div>

            {allDiscrepancies.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                <span className="text-3xl">✓</span>
                <p className="font-bold text-emerald-800">No active discrepancies</p>
                <p className="text-slate-400">All received shipments met temperature and container integrity specifications.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {allDiscrepancies.map((disc: any) => (
                  <div key={disc.id} className="p-5 hover:bg-slate-50/70 transition-all space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                          {disc.orderNumber}
                        </span>
                        <span className="font-bold px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-800">
                          {disc.category}
                        </span>
                        <span className="font-bold px-2 py-0.5 rounded-full text-[10px] bg-red-100 text-red-900">
                          {disc.severity}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(disc.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-slate-700 bg-rose-50/50 p-2.5 rounded-xl border border-rose-100">
                      <strong>Description:</strong> {disc.description}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CUSTODY TRAIL LOOKUP */}
        {activeTab === 'custody' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Full Immutable Custody Trail Lookup
              </h3>
              <p className="text-[11px] text-slate-500">
                Reconstruct complete lineage and chain of custody for any blood component received by this hospital.
              </p>
            </div>

            <form onSubmit={handleLookupCustody} className="flex gap-2 max-w-lg">
              <input
                type="text"
                placeholder="Enter Component Unit UUID or Code..."
                value={custodyUnitId}
                onChange={(e) => setCustodyUnitId(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
              />
              <button
                type="submit"
                disabled={custodyLoading}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                {custodyLoading ? 'Tracing...' : 'Trace Custody'}
              </button>
            </form>

            {custodyHistory && (
              <div className="space-y-4 pt-4 border-t border-slate-200 text-xs">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900 text-sm">
                    Component: {custodyHistory.component?.componentCode} ({custodyHistory.component?.componentType})
                  </div>
                  <div>Blood Group: <strong>{custodyHistory.component?.bloodGroup}</strong> • Status: <strong>{custodyHistory.component?.status}</strong></div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Custody Transitions Trail</h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {custodyHistory.custodyTrail?.map((h: any, idx: number) => (
                      <div key={idx} className="p-3 text-xs flex items-center justify-between">
                        <div>
                          <span className="font-mono font-bold text-slate-900">{h.fromStatus} → {h.toStatus}</span>
                          <div className="text-[11px] text-slate-500">{h.reason}</div>
                        </div>
                        <div className="text-right text-[11px] text-slate-400">
                          <div>{h.organisation} ({h.actor})</div>
                          <div className="font-mono">{new Date(h.timestamp).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: Acknowledge Hospital Receipt */}
      {selectedOrderForReceipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Hospital Receipt Intake Verification
                </h3>
                <p className="text-xs text-slate-500">
                  Order #{selectedOrderForReceipt.orderNumber} • Verify each received component container
                </p>
              </div>
              <button
                onClick={() => setSelectedOrderForReceipt(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAcknowledgeReceipt} className="space-y-4">
              <div className="space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Verify Component Containers
                </span>
                {selectedOrderForReceipt.items.map((item: any) => {
                  const current = receiptOutcomes[item.componentUnitId] || { outcome: 'VERIFIED_INTACT', notes: '' };
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-bold text-slate-900">
                          {item.componentUnit?.componentCode || 'Unit'} ({item.componentUnit?.bloodGroup})
                        </span>
                        <select
                          value={current.outcome}
                          onChange={(e) => {
                            setReceiptOutcomes((prev) => ({
                              ...prev,
                              [item.componentUnitId]: { ...current, outcome: e.target.value },
                            }));
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            current.outcome === 'VERIFIED_INTACT'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-rose-50 text-rose-800 border-rose-300'
                          }`}
                        >
                          <option value="VERIFIED_INTACT">✓ Verified Intact &amp; In-Spec</option>
                          <option value="DAMAGED">⚠ Damaged Container</option>
                          <option value="TEMPERATURE_EXCURSION">❄ Temperature Excursion</option>
                          <option value="MISSING">✕ Unit Missing</option>
                          <option value="MISMATCHED">❓ Identifier Mismatched</option>
                        </select>
                      </div>

                      {current.outcome !== 'VERIFIED_INTACT' && (
                        <input
                          type="text"
                          required
                          placeholder="Document discrepancy details (mandatory for damaged/missing)..."
                          value={current.notes}
                          onChange={(e) => {
                            setReceiptOutcomes((prev) => ({
                              ...prev,
                              [item.componentUnitId]: { ...current, notes: e.target.value },
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-rose-300 text-xs text-rose-900 bg-white"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  General Intake Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Transport seals verified, cold chain continuous..."
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                <strong>Clinical Safety Notice:</strong> Acknowledging hospital receipt confirms facility physical custody. It does <strong>not</strong> substitute for bedside verification or clinical transfusion records.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForReceipt(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReceipt}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs"
                >
                  {submittingReceipt ? 'Confirming...' : 'Confirm Hospital Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Request Details */}
      {selectedRequestDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-black text-slate-900">
                Patient Request: {selectedRequestDetail.requestReference}
              </h3>
              <button
                onClick={() => setSelectedRequestDetail(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div><strong>Patient:</strong> {selectedRequestDetail.patientName}</div>
              <div><strong>Admitted Hospital:</strong> {selectedRequestDetail.hospitalName}</div>
              <div><strong>Blood Group:</strong> {selectedRequestDetail.bloodGroup}</div>
              <div><strong>Component:</strong> {selectedRequestDetail.component}</div>
              <div><strong>Units Requested:</strong> {selectedRequestDetail.unitsRequested}</div>
              <div><strong>Status:</strong> {selectedRequestDetail.fulfillmentStatus}</div>
              <div><strong>Designated Centre:</strong> {selectedRequestDetail.designatedBloodBank}</div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedRequestDetail(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
