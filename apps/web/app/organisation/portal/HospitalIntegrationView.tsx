'use client';

import React, { useState, useEffect } from 'react';
import { authFetch } from '../../config/api';

interface HospitalIntegrationViewProps {
  organisationId: string;
  userRole: string;
  isAdmin: boolean;
  isAuditor: boolean;
  refreshSignal?: number;
  initialSubTab?: 'orders' | 'intake' | 'discrepancies' | 'disposition' | 'custody';
}

export function HospitalIntegrationView({
  organisationId,
  userRole,
  isAdmin,
  isAuditor,
  refreshSignal = 0,
  initialSubTab,
}: HospitalIntegrationViewProps) {
  const [subTab, setSubTab] = useState<'orders' | 'intake' | 'discrepancies' | 'disposition' | 'custody'>(initialSubTab || 'orders');

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Authorise issue modal state
  const [showAuthoriseModal, setShowAuthoriseModal] = useState(false);
  const [receivingFacilityId, setReceivingFacilityId] = useState('');
  const [componentUnitIdsInput, setComponentUnitIdsInput] = useState('');
  const [requestIdInput, setRequestIdInput] = useState('');
  const [authorisationReason, setAuthorisationReason] = useState('Urgent transfusion request matching protocol');
  const [authoriseNotes, setAuthoriseNotes] = useState('');
  const [authoriseLoading, setAuthoriseLoading] = useState(false);

  // Dispatch modal state
  const [selectedOrderForDispatch, setSelectedOrderForDispatch] = useState<any | null>(null);
  const [courierName, setCourierName] = useState('Maharashtra Cold-Chain Transport');
  const [vehicleNumber, setVehicleNumber] = useState('MH-12-HB-4021');
  const [driverPhone, setDriverPhone] = useState('+919876543210');
  const [coldBoxTempCelsius, setColdBoxTempCelsius] = useState(4.0);
  const [dispatchNotes, setDispatchNotes] = useState('Insulated cold shipper with calibrated logger');
  const [dispatchLoading, setDispatchLoading] = useState(false);

  // Intake/Receipt modal state
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<any | null>(null);
  const [receiptOutcomes, setReceiptOutcomes] = useState<Record<string, { outcome: string; notes: string }>>({});
  const [receiptLoading, setReceiptLoading] = useState(false);

  // Disposition modal state
  const [dispositionComponentId, setDispositionComponentId] = useState('');
  const [dispositionType, setDispositionType] = useState<string>('TRANSFUSION_DOCUMENTED');
  const [dispositionReason, setDispositionReason] = useState('Transfusion completed without adverse event');
  const [documentationRef, setDocumentationRef] = useState('');
  const [clinicalProtocolRef, setClinicalProtocolRef] = useState('Standard Cross-Match Protocol');
  const [recipientPatientRef, setRecipientPatientRef] = useState('');
  const [dispositionNotes, setDispositionNotes] = useState('');
  const [dispositionLoading, setDispositionLoading] = useState(false);

  // Custody lookup
  const [custodySearchId, setCustodySearchId] = useState('');
  const [custodyData, setCustodyData] = useState<any | null>(null);
  const [custodyLoading, setCustodyLoading] = useState(false);

  // Fetch orders
  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/v1/hospital/orders?organisationId=${organisationId}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch orders');
      }
      setOrders(data.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [organisationId, refreshSignal]);

  // Handle Authorise Issue
  const handleAuthoriseIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAuthoriseLoading(true);
      setError(null);
      setSuccessMsg(null);

      const componentUnitIds = componentUnitIdsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await authFetch('/api/v1/hospital/issues/authorise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisationId,
          receivingFacilityId,
          componentUnitIds,
          requestId: requestIdInput.trim() || undefined,
          authorisationReason,
          notes: authoriseNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Authorisation failed');
      }

      setSuccessMsg(`Issue Order ${data.data.orderNumber} successfully authorised.`);
      setShowAuthoriseModal(false);
      setComponentUnitIdsInput('');
      setRequestIdInput('');
      fetchOrders();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAuthoriseLoading(false);
    }
  };

  // Handle Dispatch
  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForDispatch) return;

    try {
      setDispatchLoading(true);
      setError(null);
      setSuccessMsg(null);

      const res = await authFetch('/api/v1/hospital/issues/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisationId,
          issueOrderId: selectedOrderForDispatch.id,
          transportDetails: {
            courierName,
            vehicleNumber,
            driverPhone,
            coldBoxTempCelsius: Number(coldBoxTempCelsius),
            notes: dispatchNotes,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Dispatch failed');
      }

      setSuccessMsg(`Order ${selectedOrderForDispatch.orderNumber} dispatched successfully.`);
      setSelectedOrderForDispatch(null);
      fetchOrders();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDispatchLoading(false);
    }
  };

  // Handle Receipt
  const handleReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForReceipt) return;

    try {
      setReceiptLoading(true);
      setError(null);
      setSuccessMsg(null);

      const receipts = selectedOrderForReceipt.items.map((item: any) => {
        const itemOutcome = receiptOutcomes[item.componentUnitId]?.outcome || 'VERIFIED_INTACT';
        const itemNotes = receiptOutcomes[item.componentUnitId]?.notes || '';
        return {
          componentUnitId: item.componentUnitId,
          outcome: itemOutcome,
          notes: itemNotes,
        };
      });

      const res = await authFetch('/api/v1/hospital/issues/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisationId,
          issueOrderId: selectedOrderForReceipt.id,
          receipts,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Receiving acknowledgement failed');
      }

      setSuccessMsg(`Receiving acknowledged for Order ${selectedOrderForReceipt.orderNumber}.`);
      setSelectedOrderForReceipt(null);
      fetchOrders();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReceiptLoading(false);
    }
  };

  // Handle Disposition
  const handleDisposition = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setDispositionLoading(true);
      setError(null);
      setSuccessMsg(null);

      const res = await authFetch('/api/v1/hospital/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisationId,
          componentUnitId: dispositionComponentId.trim(),
          dispositionType,
          reason: dispositionReason,
          documentationRef: documentationRef.trim() || undefined,
          clinicalProtocolRef: clinicalProtocolRef.trim() || undefined,
          recipientPatientRef: recipientPatientRef.trim() || undefined,
          notes: dispositionNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Disposition recording failed');
      }

      setSuccessMsg(`Final disposition recorded successfully (${dispositionType}).`);
      setDispositionComponentId('');
      setDocumentationRef('');
      setRecipientPatientRef('');
      fetchOrders();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDispositionLoading(false);
    }
  };

  // Handle Custody Lookup
  const handleLookupCustody = async (componentId: string) => {
    try {
      setCustodyLoading(true);
      setError(null);
      setCustodyData(null);

      const res = await authFetch(`/api/v1/hospital/components/${encodeURIComponent(componentId)}/custody?organisationId=${organisationId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Custody lookup failed');
      }

      setCustodyData(data.data);
      setSubTab('custody');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCustodyLoading(false);
    }
  };

  const allDiscrepancies = orders.flatMap((o) =>
    (o.discrepancies || []).map((d: any) => ({ ...d, orderNumber: o.orderNumber }))
  );

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="font-bold ml-2">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* Header and Sub-navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Hospital Integration & Issue Tracking</h2>
          <p className="text-xs text-slate-500">
            Controlled issue, transport dispatch, facility intake verification &amp; clinical disposition
          </p>
        </div>

        {!isAuditor && (
          <button
            onClick={() => setShowAuthoriseModal(true)}
            className="px-4 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1527] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
          >
            <span>+</span> Authorise Component Issue
          </button>
        )}
      </div>

      {/* Task-oriented Subtabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setSubTab('orders')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'orders'
              ? 'bg-slate-900 text-white'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          📦 Orders & Dispatch ({orders.length})
        </button>
        <button
          onClick={() => setSubTab('intake')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'intake'
              ? 'bg-slate-900 text-white'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          🏥 Facility Intake & Receipt
        </button>
        <button
          onClick={() => setSubTab('discrepancies')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'discrepancies'
              ? 'bg-slate-900 text-white'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          ⚠️ Discrepancies ({allDiscrepancies.length})
        </button>
        <button
          onClick={() => setSubTab('disposition')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'disposition'
              ? 'bg-slate-900 text-white'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          📋 Final Disposition Records
        </button>
        <button
          onClick={() => setSubTab('custody')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'custody'
              ? 'bg-slate-900 text-white'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          🔍 Component Custody Trail
        </button>
      </div>

      {/* SUBTAB 1: ORDERS & DISPATCH */}
      {subTab === 'orders' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Hospital Issue Orders</h3>
            <button onClick={fetchOrders} className="text-xs text-slate-500 hover:text-slate-800 font-bold">
              ↻ Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No hospital issue orders recorded yet. Authorise an issue above to start.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {orders.map((order) => {
                const isIssuingOrg = order.issuingOrganisationId === organisationId;
                const isReceivingOrg = order.receivingFacilityId === organisationId;

                return (
                  <div key={order.id} className="p-5 hover:bg-slate-50/70 transition-all space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-slate-900">{order.orderNumber}</span>
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            order.status === 'AUTHORISED'
                              ? 'bg-amber-100 text-amber-800'
                              : order.status === 'DISPATCHED'
                              ? 'bg-blue-100 text-blue-800'
                              : order.status === 'RECEIVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.status === 'RECEIVED_WITH_DISCREPANCIES'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isIssuingOrg && order.status === 'AUTHORISED' && !isAuditor && (
                          <button
                            onClick={() => setSelectedOrderForDispatch(order)}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                          >
                            🚀 Dispatch Transport
                          </button>
                        )}
                        {isReceivingOrg && (order.status === 'DISPATCHED' || order.status === 'PARTIALLY_RECEIVED') && !isAuditor && (
                          <button
                            onClick={() => {
                              setSelectedOrderForReceipt(order);
                              setSubTab('intake');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                          >
                            📥 Acknowledge Receipt
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
                      <div>
                        <span className="text-slate-400 font-medium">Issuing Bank:</span>{' '}
                        <span className="font-semibold text-slate-900">{order.issuingOrganisation?.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Receiving Facility:</span>{' '}
                        <span className="font-semibold text-slate-900">{order.receivingFacility?.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Authorised:</span>{' '}
                        <span>{new Date(order.authorisedAt).toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    {order.transportDetails && (
                      <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1 border border-slate-100">
                        <span className="font-bold text-slate-700">🚚 Transport Details:</span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600 mt-1">
                          <div>Carrier: {order.transportDetails.courierName || 'N/A'}</div>
                          <div>Vehicle: {order.transportDetails.vehicleNumber || 'N/A'}</div>
                          <div>Temp: {order.transportDetails.coldBoxTempCelsius ?? 'N/A'}°C</div>
                          <div>Driver: {order.transportDetails.driverPhone || 'N/A'}</div>
                        </div>
                      </div>
                    )}

                    {/* Allocated items list */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-500">Allocated Component Units:</div>
                      <div className="flex flex-wrap gap-2">
                        {order.items?.map((item: any) => (
                          <div
                            key={item.id}
                            className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs flex items-center gap-2"
                          >
                            <span className="font-mono font-bold text-slate-900">
                              {item.componentUnit?.componentCode}
                            </span>
                            <span className="text-slate-500 text-[10px]">({item.componentUnit?.componentType})</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                              {item.status}
                            </span>
                            <button
                              onClick={() => handleLookupCustody(item.componentUnitId)}
                              className="text-[10px] text-blue-600 hover:underline font-bold cursor-pointer"
                            >
                              Trail →
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: INTAKE & RECEIPT */}
      {subTab === 'intake' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
            Facility Delivery Intake & Component Verification
          </h3>
          <p className="text-xs text-slate-500">
            Hospital staff must independently verify physical condition and cold chain for each component before accepting.
            Receiving does NOT mark units as transfused.
          </p>

          {selectedOrderForReceipt ? (
            <form onSubmit={handleReceipt} className="space-y-4 border border-slate-200 rounded-xl p-5 bg-slate-50">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <span className="text-xs font-mono font-bold text-slate-500">Order:</span>{' '}
                  <span className="text-sm font-black text-slate-900">{selectedOrderForReceipt.orderNumber}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrderForReceipt(null)}
                  className="text-xs text-slate-400 hover:text-slate-700"
                >
                  ✕ Cancel
                </button>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-700">Verify Each Received Unit:</div>
                {selectedOrderForReceipt.items?.map((item: any) => (
                  <div key={item.id} className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {item.componentUnit?.componentCode} ({item.componentUnit?.componentType})
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        Blood Group: {item.componentUnit?.bloodGroup}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Receipt Outcome</label>
                        <select
                          value={receiptOutcomes[item.componentUnitId]?.outcome || 'VERIFIED_INTACT'}
                          onChange={(e) =>
                            setReceiptOutcomes((prev) => ({
                              ...prev,
                              [item.componentUnitId]: {
                                outcome: e.target.value,
                                notes: prev[item.componentUnitId]?.notes || '',
                              },
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                        >
                          <option value="VERIFIED_INTACT">Verified Intact (No damage, cold chain ok)</option>
                          <option value="DAMAGED">Damaged Container / Bag Leak</option>
                          <option value="TEMPERATURE_EXCURSION">Temperature Excursion Breached</option>
                          <option value="MISMATCHED">Identifier Mismatched</option>
                          <option value="MISSING">Missing / Not in Shipper</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Discrepancy Notes (if any)</label>
                        <input
                          type="text"
                          placeholder="Condition notes..."
                          value={receiptOutcomes[item.componentUnitId]?.notes || ''}
                          onChange={(e) =>
                            setReceiptOutcomes((prev) => ({
                              ...prev,
                              [item.componentUnitId]: {
                                outcome: prev[item.componentUnitId]?.outcome || 'VERIFIED_INTACT',
                                notes: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForReceipt(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={receiptLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  {receiptLoading ? 'Acknowledging...' : 'Confirm Receipt & Log Verification'}
                </button>
              </div>
            </form>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              Select an in-transit order from the "Orders & Dispatch" tab to acknowledge intake.
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: DISCREPANCIES */}
      {subTab === 'discrepancies' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
            Delivery Discrepancies & Audit Exceptions
          </h3>
          <p className="text-xs text-slate-500">
            All temperature excursions, damaged containers, and missing units generate permanent compliance exceptions.
          </p>

          {allDiscrepancies.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              No discrepancies or exceptions reported across active hospital issue orders.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {allDiscrepancies.map((disc) => (
                <div key={disc.id} className="py-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-slate-900">
                      Order: {disc.orderNumber} — Category: {disc.category}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        disc.severity === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-800'
                          : disc.severity === 'HIGH'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {disc.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{disc.description}</p>
                  <div className="text-[10px] text-slate-400">
                    Status: {disc.status} | Reported: {new Date(disc.createdAt).toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 4: FINAL DISPOSITION */}
      {subTab === 'disposition' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Document Final Component Disposition
            </h3>
            <p className="text-xs text-slate-500">
              Clinical safety rules: Only CLINICAL_STAFF may document transfusion. Transfusion requires documentation reference.
              Returned units enter quarantine assessment. Discarded units cannot be reactivated.
            </p>
          </div>

          <form onSubmit={handleDisposition} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Component Unit Identifier (UUID)</label>
              <input
                type="text"
                required
                placeholder="e.g. 84ef4627-c159-42b7-a0f5-..."
                value={dispositionComponentId}
                onChange={(e) => setDispositionComponentId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Disposition Type</label>
              <select
                value={dispositionType}
                onChange={(e) => setDispositionType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
              >
                <option value="TRANSFUSION_DOCUMENTED">Transfusion Documented (Requires CLINICAL_STAFF & Evidence)</option>
                <option value="RETURNED_TO_BANK">Returned to Blood Bank (Enters Quarantine Assessment)</option>
                <option value="DISCARDED_DAMAGED">Discarded — Physical Damage / Leak</option>
                <option value="DISCARDED_EXPIRED">Discarded — Shelf-Life Expiry</option>
                <option value="DISCARDED_CLINICAL">Discarded — Clinical Order / Bio-waste</option>
                <option value="OTHER">Other Documented Disposition</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Documented Reason</label>
              <input
                type="text"
                required
                placeholder="Clinical reason..."
                value={dispositionReason}
                onChange={(e) => setDispositionReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Supporting Documentation Reference (e.g. Crossmatch ID / MRN / Waste Voucher)
              </label>
              <input
                type="text"
                placeholder="e.g. XM-2026-PUN-8812 or BIO-WASTE-901"
                value={documentationRef}
                onChange={(e) => setDocumentationRef(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
              />
            </div>

            {dispositionType === 'TRANSFUSION_DOCUMENTED' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Recipient Patient Reference (Masked for privacy)
                </label>
                <input
                  type="text"
                  placeholder="e.g. MRN-78192"
                  value={recipientPatientRef}
                  onChange={(e) => setRecipientPatientRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Additional Notes</label>
              <textarea
                rows={2}
                placeholder="Optional notes..."
                value={dispositionNotes}
                onChange={(e) => setDispositionNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={dispositionLoading}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              {dispositionLoading ? 'Recording...' : 'Record Auditable Disposition'}
            </button>
          </form>
        </div>
      )}

      {/* SUBTAB 5: CUSTODY TRAIL */}
      {subTab === 'custody' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
            Component Custody & Traceability Reconstruction
          </h3>

          <div className="flex gap-2 max-w-md">
            <input
              type="text"
              placeholder="Enter Component Unit ID..."
              value={custodySearchId}
              onChange={(e) => setCustodySearchId(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
            />
            <button
              onClick={() => handleLookupCustody(custodySearchId.trim())}
              disabled={custodyLoading || !custodySearchId.trim()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer"
            >
              {custodyLoading ? 'Tracing...' : 'Trace'}
            </button>
          </div>

          {custodyData && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-black text-slate-900">
                    {custodyData.component?.componentCode}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-white border border-slate-200 text-slate-800">
                    Status: {custodyData.component?.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600">
                  <div>Type: {custodyData.component?.componentType}</div>
                  <div>Blood Group: {custodyData.component?.bloodGroup}</div>
                  <div>Volume: {custodyData.component?.volumeMl} ml</div>
                  <div>Origin Unit: {custodyData.component?.originatingCollectionUnit?.unitNumber}</div>
                </div>
              </div>

              {/* Custody trail timeline */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700">Custody Lifecycle Trail:</h4>
                <div className="space-y-2">
                  {custodyData.custodyTrail?.map((trail: any, idx: number) => (
                    <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span>
                          {trail.fromStatus || 'INIT'} → {trail.toStatus}
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {new Date(trail.timestamp).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="text-slate-600">
                        Org: {trail.organisation} | Actor: {trail.actor}
                      </div>
                      <div className="text-[11px] text-slate-500 italic">Reason: {trail.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Authorise Issue */}
      {showAuthoriseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-black text-slate-900">Authorise Component Issue</h3>
            <form onSubmit={handleAuthoriseIssue} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Receiving Facility Organisation ID</label>
                <input
                  type="text"
                  required
                  placeholder="Facility UUID..."
                  value={receivingFacilityId}
                  onChange={(e) => setReceivingFacilityId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Component Unit UUIDs (comma-separated)
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000, ..."
                  value={componentUnitIdsInput}
                  onChange={(e) => setComponentUnitIdsInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Linked Patient Request ID (Optional)</label>
                <input
                  type="text"
                  placeholder="Request UUID..."
                  value={requestIdInput}
                  onChange={(e) => setRequestIdInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Authorisation Reason</label>
                <input
                  type="text"
                  required
                  value={authorisationReason}
                  onChange={(e) => setAuthorisationReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAuthoriseModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={authoriseLoading}
                  className="px-4 py-2 bg-[#B91C32] hover:bg-[#9B1527] text-white rounded-lg text-xs font-bold"
                >
                  {authoriseLoading ? 'Authorising...' : 'Confirm Authorisation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Dispatch Transport */}
      {selectedOrderForDispatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-black text-slate-900">
              Dispatch Transport for Order: {selectedOrderForDispatch.orderNumber}
            </h3>
            <form onSubmit={handleDispatch} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Courier / Carrier Name</label>
                <input
                  type="text"
                  required
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle Number</label>
                  <input
                    type="text"
                    required
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cold Box Temp (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={coldBoxTempCelsius}
                    onChange={(e) => setColdBoxTempCelsius(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Driver Contact Phone</label>
                <input
                  type="text"
                  required
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForDispatch(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                >
                  {dispatchLoading ? 'Dispatching...' : 'Confirm Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
