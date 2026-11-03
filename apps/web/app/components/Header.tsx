'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { formatPhoneNumber } from '../config/phone';

export function notifyAuthChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('raktasetu:auth-change'));
  }
}

interface UserData {
  id: string;
  phoneNumber: string;
  name?: string | null;
  role?: string;
  hasDonorProfile?: boolean;
}

interface OrgMembershipData {
  organisationId: string;
  orgCode: string;
  organisationName: string;
  role: string;
}

type DropdownId = 'looking-blood' | 'donate-blood' | 'organisation' | 'resources' | 'profile';

export function Header() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserData | null>(null);
  const [orgMemberships, setOrgMemberships] = useState<OrgMembershipData[]>([]);
  const [activeDropdown, setActiveDropdown] = useState<DropdownId | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSectionOpen, setMobileSectionOpen] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  // Prevent background scrolling when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Session verification handler
  const verifySession = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('raktasetu_token') : null;
    if (!token) {
      setUser(null);
      setOrgMemberships([]);
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/profile/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data?.user) {
          setUser({
            id: data.data.user.id,
            phoneNumber: data.data.user.phoneNumber,
            name: data.data.user.name,
            role: data.data.user.role,
            hasDonorProfile: Boolean(data.data.donorProfile),
          });

          // Fetch active organisation memberships
          try {
            const orgRes = await fetch(`${apiUrl}/organisations/me/memberships`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (orgRes.ok) {
              const orgData = await orgRes.json();
              if (orgData.success && Array.isArray(orgData.data)) {
                setOrgMemberships(
                  orgData.data.map((m: any) => ({
                    organisationId: m.organisationId,
                    orgCode: m.orgCode,
                    organisationName: m.organisationName,
                    role: m.role,
                  }))
                );
              }
            }
          } catch {
            setOrgMemberships([]);
          }
          return;
        }
      }

      // If invalid session, clear stale state
      localStorage.removeItem('raktasetu_user');
      localStorage.removeItem('raktasetu_token');
      setUser(null);
      setOrgMemberships([]);
    } catch {
      // In case of offline/network blip, fallback to cached state if present
      const savedUser = localStorage.getItem('raktasetu_user');
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch {
          setUser(null);
        }
      }
    }
  }, [apiUrl]);

  // Verify session on mount, pathname change, and explicit auth change events
  useEffect(() => {
    verifySession();

    const handleAuthEvent = () => {
      verifySession();
    };

    window.addEventListener('raktasetu:auth-change', handleAuthEvent);
    window.addEventListener('storage', handleAuthEvent);

    return () => {
      window.removeEventListener('raktasetu:auth-change', handleAuthEvent);
      window.removeEventListener('storage', handleAuthEvent);
    };
  }, [verifySession, pathname]);

  // Close dropdown on outside click and Escape key
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setActiveDropdown(null);
        setMobileMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMouseEnter = (id: DropdownId) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setActiveDropdown(id);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 180);
  };

  const toggleDropdown = (id: DropdownId) => {
    setActiveDropdown((prev) => (prev === id ? null : id));
  };

  const closeAll = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setActiveDropdown(null);
    setMobileMenuOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('raktasetu_user');
    localStorage.removeItem('raktasetu_token');
    setUser(null);
    closeAll();
    window.location.href = '/login';
  };

  const toggleMobileSection = (section: string) => {
    setMobileSectionOpen((prev) => (prev === section ? null : section));
  };

  const displayName = user?.name?.trim() || user?.phoneNumber || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  // Active section flags
  const isLookingBloodActive = pathname === '/find-blood' || pathname === '/directory' || pathname.startsWith('/blood-centres');
  const isDonateBloodActive = pathname === '/donor-registration' || pathname === '/camps' || pathname === '/about-donating' || pathname === '/donor-dashboard';
  const isOrganisationActive = pathname.startsWith('/organisation');
  const isResourcesActive = pathname === '/blog' || pathname === '/faqs' || pathname === '/notifications' || pathname === '/about' || pathname === '/contact';

  return (
    <header ref={headerRef} className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Logo & Title */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0" onClick={closeAll}>
          <div className="w-9 h-9 rounded-xl bg-[#B91C32] flex items-center justify-center text-white shadow-xs">
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <span className="font-extrabold text-xl tracking-tight text-slate-900">RaktaSetu</span>
        </Link>

        {/* Desktop Navigation with Hover & Click Triggers */}
        <nav className="hidden lg:flex items-center gap-1.5 xl:gap-3 text-sm font-medium">
          {/* Dropdown A: Looking for Blood */}
          <div
            className="relative"
            onMouseEnter={() => handleMouseEnter('looking-blood')}
            onMouseLeave={handleMouseLeave}
          >
            <button
              type="button"
              onClick={() => toggleDropdown('looking-blood')}
              aria-expanded={activeDropdown === 'looking-blood'}
              aria-haspopup="true"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors font-medium cursor-pointer ${
                activeDropdown === 'looking-blood'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : isLookingBloodActive
                  ? 'bg-red-50 text-[#B91C32] font-semibold'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>Looking for Blood</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  activeDropdown === 'looking-blood'
                    ? 'rotate-180 text-slate-700'
                    : isLookingBloodActive
                    ? 'text-[#B91C32]'
                    : 'text-slate-400'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {activeDropdown === 'looking-blood' && (
              <div
                className="absolute left-0 mt-1 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2 text-xs text-slate-700 z-50 animate-in fade-in duration-150"
                onMouseEnter={() => handleMouseEnter('looking-blood')}
                onMouseLeave={handleMouseLeave}
              >
                <Link
                  href="/find-blood"
                  onClick={closeAll}
                  className="flex items-center px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                >
                  Find Blood Now
                </Link>
                <Link
                  href="/directory"
                  onClick={closeAll}
                  className="flex items-center px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                >
                  Blood Bank Directory
                </Link>
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-400 cursor-not-allowed">
                  <span className="font-medium">Thalassemia &amp; Recurring Requests</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                    Coming soon
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Dropdown B: Donate Blood */}
          <div
            className="relative"
            onMouseEnter={() => handleMouseEnter('donate-blood')}
            onMouseLeave={handleMouseLeave}
          >
            <button
              type="button"
              onClick={() => toggleDropdown('donate-blood')}
              aria-expanded={activeDropdown === 'donate-blood'}
              aria-haspopup="true"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors font-medium cursor-pointer ${
                activeDropdown === 'donate-blood'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : isDonateBloodActive
                  ? 'bg-red-50 text-[#B91C32] font-semibold'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>Donate Blood</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  activeDropdown === 'donate-blood'
                    ? 'rotate-180 text-slate-700'
                    : isDonateBloodActive
                    ? 'text-[#B91C32]'
                    : 'text-slate-400'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {activeDropdown === 'donate-blood' && (
              <div
                className="absolute left-0 mt-1 w-56 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2 text-xs text-slate-700 z-50 animate-in fade-in duration-150"
                onMouseEnter={() => handleMouseEnter('donate-blood')}
                onMouseLeave={handleMouseLeave}
              >
                <Link
                  href="/donor-registration"
                  onClick={closeAll}
                  className="flex items-center px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                >
                  Register as Donor
                </Link>
                <Link
                  href="/camps"
                  onClick={closeAll}
                  className="flex items-center px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                >
                  Find a Camp
                </Link>
                <Link
                  href="/about-donating"
                  onClick={closeAll}
                  className="flex items-center px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                >
                  About Donating
                </Link>
              </div>
            )}
          </div>

          {/* Dropdown C: Organisation */}
          <div
            className="relative"
            onMouseEnter={() => handleMouseEnter('organisation')}
            onMouseLeave={handleMouseLeave}
          >
            <button
              type="button"
              onClick={() => toggleDropdown('organisation')}
              aria-expanded={activeDropdown === 'organisation'}
              aria-haspopup="true"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors font-medium cursor-pointer ${
                activeDropdown === 'organisation'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : isOrganisationActive
                  ? 'bg-red-50 text-[#B91C32] font-semibold'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>Organisation</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  activeDropdown === 'organisation'
                    ? 'rotate-180 text-slate-700'
                    : isOrganisationActive
                    ? 'text-[#B91C32]'
                    : 'text-slate-400'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {activeDropdown === 'organisation' && (
              <div
                className="absolute left-0 mt-1 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2 text-xs text-slate-700 z-50 animate-in fade-in duration-150"
                onMouseEnter={() => handleMouseEnter('organisation')}
                onMouseLeave={handleMouseLeave}
              >
                {orgMemberships.length > 0 ? (
                  <>
                    <div className="px-3.5 py-2 mb-1 bg-red-50/70 rounded-xl border border-red-100">
                      <span className="text-[10px] uppercase font-bold text-[#B91C32] tracking-wider block">
                        Active Institutional Role
                      </span>
                      <span className="font-bold text-slate-900 block truncate">
                        {orgMemberships[0].organisationName}
                      </span>
                      <span className="text-[10px] text-slate-600 font-mono">
                        {orgMemberships[0].role.replace('_', ' ')}
                      </span>
                    </div>
                    <Link
                      href="/organisation/portal"
                      onClick={closeAll}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                    >
                      <span>Organisation Workspace</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-[#B91C32] px-2 py-0.5 rounded-full">
                        Portal
                      </span>
                    </Link>
                    <Link
                      href="/camp/dashboard"
                      onClick={closeAll}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                    >
                      <span>Camp Operations Dashboard</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                        Camp
                      </span>
                    </Link>
                    <Link
                      href="/organisation/register-camp"
                      onClick={closeAll}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                    >
                      <span>Propose a Blood Drive / Camp</span>
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/organisation/login"
                      onClick={closeAll}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                    >
                      <span>Organisation Staff Login</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        Bank
                      </span>
                    </Link>
                    <Link
                      href="/camp/login"
                      onClick={closeAll}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                    >
                      <span>Camp Coordinator Login</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                        Camp
                      </span>
                    </Link>
                    <Link
                      href="/organisation/register-bank"
                      onClick={closeAll}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                    >
                      <span>Register a Blood Bank</span>
                    </Link>
                    <Link
                      href="/organisation/register-camp"
                      onClick={closeAll}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                    >
                      <span>Register a Camp</span>
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Dropdown D: Resources */}
          <div
            className="relative"
            onMouseEnter={() => handleMouseEnter('resources')}
            onMouseLeave={handleMouseLeave}
          >
            <button
              type="button"
              onClick={() => toggleDropdown('resources')}
              aria-expanded={activeDropdown === 'resources'}
              aria-haspopup="true"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors font-medium cursor-pointer ${
                activeDropdown === 'resources'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : isResourcesActive
                  ? 'bg-red-50 text-[#B91C32] font-semibold'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>Resources</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  activeDropdown === 'resources'
                    ? 'rotate-180 text-slate-700'
                    : isResourcesActive
                    ? 'text-[#B91C32]'
                    : 'text-slate-400'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {activeDropdown === 'resources' && (
              <div
                className="absolute left-0 mt-1 w-56 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2 text-xs text-slate-700 z-50 animate-in fade-in duration-150"
                onMouseEnter={() => handleMouseEnter('resources')}
                onMouseLeave={handleMouseLeave}
              >
                <Link
                  href="/blog"
                  onClick={closeAll}
                  className="flex items-center px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                >
                  Stories &amp; Awareness
                </Link>
                <Link
                  href="/faqs"
                  onClick={closeAll}
                  className="flex items-center px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                >
                  FAQs
                </Link>
                <Link
                  href="/notifications"
                  onClick={closeAll}
                  className="flex items-center px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                >
                  Notifications
                </Link>
                <Link
                  href="/about"
                  onClick={closeAll}
                  className="flex items-center px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                >
                  About Us
                </Link>
                <Link
                  href="/contact"
                  onClick={closeAll}
                  className="flex items-center px-3.5 py-2.5 rounded-xl hover:bg-slate-50 font-semibold text-slate-900 hover:text-[#B91C32] transition-colors"
                >
                  Contact Us
                </Link>
              </div>
            )}
          </div>
        </nav>

        {/* Far Right: Authenticated Avatar or Login / Register Button */}
        <div className="hidden lg:flex items-center gap-3">
          {user?.role === 'ADMIN' && (
            <Link
              href="/organisation/portal?tab=applications"
              className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <span>🏛️</span>
              <span>Admin Dashboard</span>
            </Link>
          )}
          {user ? (
            /* Authenticated Profile Dropdown */
            <div
              className="relative"
              onMouseEnter={() => handleMouseEnter('profile')}
              onMouseLeave={handleMouseLeave}
            >
              <button
                type="button"
                onClick={() => toggleDropdown('profile')}
                className="flex items-center gap-2.5 p-1 rounded-full hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                aria-label="User profile menu"
                aria-expanded={activeDropdown === 'profile'}
              >
                <div className="w-8 h-8 rounded-full bg-red-100 text-[#B91C32] font-bold text-xs flex items-center justify-center border border-red-200">
                  {initial}
                </div>
                <span className="text-xs font-semibold text-slate-700 max-w-[120px] truncate hidden xl:inline">
                  {user.name || user.phoneNumber}
                </span>
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {activeDropdown === 'profile' && (
                <div
                  className="absolute right-0 mt-1 w-56 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-1.5 text-xs text-slate-700 z-50 animate-in fade-in duration-150"
                  onMouseEnter={() => handleMouseEnter('profile')}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900 truncate">{user.name || 'Voluntary User'}</p>
                      {user.role === 'ADMIN' && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-full">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 font-mono text-[11px] mt-0.5">{formatPhoneNumber(user.phoneNumber)}</p>
                  </div>

                  {user.role === 'ADMIN' && (
                    <Link
                      href="/organisation/portal?tab=applications"
                      onClick={closeAll}
                      className="flex items-center justify-between px-4 py-2.5 bg-purple-50 hover:bg-purple-100 font-bold text-purple-900 border-b border-purple-200"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm">🏛️</span>
                        <span>Platform Admin Dashboard</span>
                      </div>
                      <span className="text-[10px] font-bold bg-purple-700 text-white px-1.5 py-0.5 rounded-md">
                        Review
                      </span>
                    </Link>
                  )}

                  <Link
                    href="/profile"
                    onClick={closeAll}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 font-medium text-slate-800"
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <span>My Profile &amp; Consent</span>
                  </Link>

                  <Link
                    href="/requests"
                    onClick={closeAll}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 font-medium text-slate-800"
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span>My Blood Requests</span>
                  </Link>

                  {user.hasDonorProfile && (
                    <Link
                      href="/donor-dashboard"
                      onClick={closeAll}
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 font-medium text-slate-800"
                    >
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </svg>
                      <span>Donor Dashboard</span>
                    </Link>
                  )}

                  {orgMemberships.length > 0 && (
                    <Link
                      href="/organisation/portal"
                      onClick={closeAll}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 font-medium text-slate-800 border-t border-slate-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <svg className="w-4 h-4 text-[#B91C32]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                        <span>Staff Portal</span>
                      </div>
                      <span className="text-[10px] font-bold uppercase bg-red-100 text-[#B91C32] px-1.5 py-0.5 rounded">
                        {orgMemberships[0].role}
                      </span>
                    </Link>
                  )}

                  <div className="pt-1 mt-1 border-t border-slate-100">
                    <button
                      onClick={handleLogout}
                      className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-red-600 hover:bg-red-50 font-semibold cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-xs sm:text-sm font-semibold transition-all shadow-2xs"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span>Login / Register</span>
            </Link>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Collapsible Navigation Menu with Responsive Accordions */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white shadow-xl max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="p-4 space-y-3">
            {/* User Profile Card (if logged in) */}
            {user && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-[#B91C32] font-bold text-sm flex items-center justify-center border border-red-200">
                    {initial}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 truncate">{user.name || 'My Profile'}</div>
                    <div className="text-xs text-slate-500 font-mono">{formatPhoneNumber(user.phoneNumber)}</div>
                  </div>
                </div>
                <Link
                  href="/profile"
                  onClick={closeAll}
                  className="text-xs font-bold text-[#B91C32] hover:underline"
                >
                  View Profile
                </Link>
              </div>
            )}

            {user?.role === 'ADMIN' && (
              <Link
                href="/organisation/portal?tab=applications"
                onClick={closeAll}
                className="flex items-center justify-between p-3 rounded-2xl bg-purple-100 text-purple-900 border border-purple-200 font-bold text-xs"
              >
                <div className="flex items-center gap-2">
                  <span>🏛️</span>
                  <span>Platform Admin Dashboard</span>
                </div>
                <span className="text-[10px] bg-purple-700 text-white px-2 py-0.5 rounded-md">
                  Review
                </span>
              </Link>
            )}

            {/* Accordion A: Looking for Blood */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => toggleMobileSection('looking-blood')}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50/70 text-slate-900 font-bold text-sm text-left"
              >
                <span>Looking for Blood</span>
                <svg
                  className={`w-4 h-4 text-slate-500 transition-transform ${
                    mobileSectionOpen === 'looking-blood' ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {(mobileSectionOpen === 'looking-blood' || mobileSectionOpen === null) && (
                <div className="p-2 space-y-1 bg-white">
                  <Link
                    href="/find-blood"
                    onClick={closeAll}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-slate-800 hover:bg-slate-50 text-sm"
                  >
                    <span>Find Blood Now</span>
                    <span className="text-xs bg-red-100 text-[#B91C32] px-2 py-0.5 rounded-full font-bold">Live</span>
                  </Link>
                  <Link
                    href="/directory"
                    onClick={closeAll}
                    className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Blood Bank Directory
                  </Link>
                  <div className="flex items-center justify-between px-3.5 py-2 text-sm text-slate-400">
                    <span>Thalassemia &amp; Recurring Requests</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      Coming soon
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion B: Donate Blood */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => toggleMobileSection('donate-blood')}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50/70 text-slate-900 font-bold text-sm text-left"
              >
                <span>Donate Blood</span>
                <svg
                  className={`w-4 h-4 text-slate-500 transition-transform ${
                    mobileSectionOpen === 'donate-blood' ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {(mobileSectionOpen === 'donate-blood' || mobileSectionOpen === null) && (
                <div className="p-2 space-y-1 bg-white">
                  <Link
                    href="/donor-registration"
                    onClick={closeAll}
                    className="block px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Register as Donor
                  </Link>
                  <Link
                    href="/camps"
                    onClick={closeAll}
                    className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Find a Camp
                  </Link>
                  <Link
                    href="/about-donating"
                    onClick={closeAll}
                    className="block px-3.5 py-2 rounded-xl text-sm font-medium text-[#B91C32] hover:bg-red-50"
                  >
                    About Donating
                  </Link>
                </div>
              )}
            </div>

            {/* Accordion C: Organisation */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => toggleMobileSection('organisation')}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50/70 text-slate-900 font-bold text-sm text-left"
              >
                <span>Organisation</span>
                <svg
                  className={`w-4 h-4 text-slate-500 transition-transform ${
                    mobileSectionOpen === 'organisation' ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {mobileSectionOpen === 'organisation' && (
                <div className="p-2 space-y-1 bg-white">
                  {orgMemberships.length > 0 ? (
                    <>
                      <Link
                        href="/organisation/portal"
                        onClick={closeAll}
                        className="block px-3.5 py-2 rounded-xl text-sm font-semibold text-[#B91C32] bg-red-50/60 hover:bg-red-50"
                      >
                        Organisation Workspace ({orgMemberships[0].role})
                      </Link>
                      <Link
                        href="/camp/dashboard"
                        onClick={closeAll}
                        className="block px-3.5 py-2 rounded-xl text-sm font-semibold text-indigo-700 bg-indigo-50/60 hover:bg-indigo-50"
                      >
                        Camp Operations Dashboard
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/organisation/login"
                        onClick={closeAll}
                        className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Organisation Staff Login
                      </Link>
                      <Link
                        href="/camp/login"
                        onClick={closeAll}
                        className="block px-3.5 py-2 rounded-xl text-sm font-medium text-indigo-700 bg-indigo-50/40 hover:bg-indigo-50"
                      >
                        Camp Coordinator Login
                      </Link>
                    </>
                  )}
                  <Link
                    href="/organisation/register-bank"
                    onClick={closeAll}
                    className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Register a Blood Bank
                  </Link>
                  <Link
                    href="/organisation/register-camp"
                    onClick={closeAll}
                    className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Register a Camp
                  </Link>
                </div>
              )}
            </div>

            {/* Accordion D: Resources */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => toggleMobileSection('resources')}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50/70 text-slate-900 font-bold text-sm text-left"
              >
                <span>Resources</span>
                <svg
                  className={`w-4 h-4 text-slate-500 transition-transform ${
                    mobileSectionOpen === 'resources' ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {(mobileSectionOpen === 'resources' || mobileSectionOpen === null) && (
                <div className="p-2 space-y-1 bg-white">
                  <Link
                    href="/blog"
                    onClick={closeAll}
                    className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Stories &amp; Awareness
                  </Link>
                  <Link
                    href="/faqs"
                    onClick={closeAll}
                    className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    FAQs
                  </Link>
                  <Link
                    href="/notifications"
                    onClick={closeAll}
                    className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Notifications
                  </Link>
                  <Link
                    href="/about"
                    onClick={closeAll}
                    className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    About Us
                  </Link>
                  <Link
                    href="/contact"
                    onClick={closeAll}
                    className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Contact Us
                  </Link>
                </div>
              )}
            </div>

            {/* Quick Portals & Sign Out/In */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              {user ? (
                <>
                  <Link
                    href="/requests"
                    onClick={closeAll}
                    className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    My Blood Requests
                  </Link>
                  <Link
                    href="/donor-dashboard"
                    onClick={closeAll}
                    className="block px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Donor Portal
                  </Link>
                  <Link
                    href="/organisation/portal"
                    onClick={closeAll}
                    className="block px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Organisation Workspace
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full text-center py-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold transition-colors cursor-pointer mt-2"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={closeAll}
                  className="block w-full text-center py-3 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-sm font-bold transition-all shadow-xs"
                >
                  Login / Register
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
