/**
 * It's A Simple Job - Work Teams & Multi-Person Crew Service
 * Powers collaborative teams for multi-person jobs across Construction, Horticulture, Machinery, etc.
 * Features:
 *  - Team creation & roster management for Franchises and Service Providers
 *  - Adding registered members from the platform
 *  - Designated Person in Charge (PIC) / Supervisor
 *  - Real-time team communication board (chat, safety alerts, milestone notes)
 *  - Work Dispatch / Job Assignment by Person in Charge:
 *      * Scope of work required
 *      * Who will do it (assigned registered members)
 *      * Date & time of jobs
 *      * Individual pricing for each service provider
 *      * Franchise margin, royalties & central settlement breakdown (if for franchise)
 */

const WORK_TEAMS_STORAGE_KEY = 'iasj_work_teams';

// Pre-seeded work teams for instant high-value demonstration
const SEED_WORK_TEAMS = [
  {
    id: 'team_const_01',
    name: 'Gold Coast Civil & Concreting Crew',
    sector: 'construction',
    sectorLabel: 'Construction & Civil',
    sectorIcon: 'fa-trowel-bricks',
    ownerType: 'provider',
    ownerId: 'SPN-101001',
    ownerName: "Lockie's Trade Fleet",
    description: 'Specialized 4-person commercial slab, formwork, reinforcement, and structural concreting team.',
    createdAt: '2026-10-01T08:00:00.000Z',
    personInCharge: {
      spn: 'SPN-101001',
      name: "Lachlan 'Lockie' Miller",
      title: 'Site Supervisor & Person in Charge (PIC)',
      phone: '0412 345 678',
      email: 'lockie.trades@gmail.com',
      avatar: 'assets/images/tradie_worker.jpg',
      trade: 'Licensed Master Plumber & Civil Concreter'
    },
    members: [
      {
        spn: 'SPN-101001',
        name: "Lachlan 'Lockie' Miller",
        trade: 'Site Supervisor / PIC',
        role: 'Person in Charge (Crew Lead)',
        phone: '0412 345 678',
        email: 'lockie.trades@gmail.com',
        avatar: 'assets/images/tradie_worker.jpg',
        pricingRate: 98,
        pricingUnit: 'hourly',
        isPic: true,
        status: 'active'
      },
      {
        spn: 'SPN-101002',
        name: 'Jack Morrison',
        trade: 'Concreter & Formwork Specialist',
        role: 'Senior Formwork Lead',
        phone: '0421 987 654',
        email: 'jack.morrison.trades@gmail.com',
        avatar: 'assets/images/tradie_worker.jpg',
        pricingRate: 90,
        pricingUnit: 'hourly',
        isPic: false,
        status: 'active'
      },
      {
        spn: 'SPN-101003',
        name: "Mitch 'Sully' Sullivan",
        trade: 'Steel Fixer & Structural Tradie',
        role: 'Steel & Rebar Specialist',
        phone: '0433 112 233',
        email: 'mitch.sully@gmail.com',
        avatar: 'assets/images/tradie_worker.jpg',
        pricingRate: 85,
        pricingUnit: 'hourly',
        isPic: false,
        status: 'active'
      },
      {
        spn: 'SPN-101004',
        name: 'Sarah Jenkins',
        trade: 'Finishing Concreter & Site Safety',
        role: 'Quality & Safety Officer',
        phone: '0405 667 889',
        email: 'sarah.j.trades@gmail.com',
        avatar: 'assets/images/tradie_worker.jpg',
        pricingRate: 80,
        pricingUnit: 'hourly',
        isPic: false,
        status: 'active'
      }
    ],
    chatMessages: [
      {
        id: 'msg_c1',
        senderSpn: 'SPN-101001',
        senderName: "Lachlan 'Lockie' Miller",
        senderRole: 'Person In Charge',
        senderAvatar: 'assets/images/tradie_worker.jpg',
        timestamp: '2026-10-07 07:30 AM',
        messageType: 'safety',
        text: 'Morning crew! Site inspection passed for 14 Marine Parade. Hard hats and steel caps required at all times. Concrete pump arrives at 8:30 AM sharp.'
      },
      {
        id: 'msg_c2',
        senderSpn: 'SPN-101002',
        senderName: 'Jack Morrison',
        senderRole: 'Senior Formwork Lead',
        senderAvatar: 'assets/images/tradie_worker.jpg',
        timestamp: '2026-10-07 07:45 AM',
        messageType: 'general',
        text: 'Formwork is 100% braced and laser leveled on the western perimeter. Ready for rebar inspection.'
      },
      {
        id: 'msg_c3',
        senderSpn: 'SPN-101003',
        senderName: "Mitch 'Sully' Sullivan",
        senderRole: 'Steel & Rebar Specialist',
        senderAvatar: 'assets/images/tradie_worker.jpg',
        timestamp: '2026-10-07 08:05 AM',
        messageType: 'materials',
        text: 'Mesh sheets and bar chairs are in place with 50mm clearance. All tied off.'
      }
    ],
    jobs: [
      {
        id: 'JOB-9041',
        title: 'Commercial Foundation Pour & Slab Extension',
        workRequired: 'Formwork setup, trench boxing, steel fixing, and 32 MPa concrete placement with helicopter power float finish.',
        location: '14 Marine Parade, Southport QLD',
        jobDate: '2026-10-14',
        jobTime: '07:00 AM',
        estimatedHours: 8,
        status: 'scheduled',
        createdBy: "Lachlan 'Lockie' Miller (PIC)",
        isFranchise: false,
        assignedMembers: [
          { spn: 'SPN-101001', name: "Lachlan 'Lockie' Miller", trade: 'Supervisor', role: 'Pump & Placement Lead', pricing: 98, pricingType: 'hourly', estimatedPayout: 784, notes: 'Direct pump operator and slump test' },
          { spn: 'SPN-101002', name: 'Jack Morrison', trade: 'Formwork', role: 'Edge Formwork Monitor', pricing: 90, pricingType: 'hourly', estimatedPayout: 720, notes: 'Ensure no blowouts on perimeter boxing' },
          { spn: 'SPN-101003', name: "Mitch 'Sully' Sullivan", trade: 'Steel Fixer', role: 'Bar Chair & Screed Lead', pricing: 85, pricingType: 'hourly', estimatedPayout: 680, notes: 'Vibrating screed operation' },
          { spn: 'SPN-101004', name: 'Sarah Jenkins', trade: 'Finisher', role: 'Power Trowel Operator', pricing: 80, pricingType: 'hourly', estimatedPayout: 640, notes: 'Apply curing compound & non-slip broom finish' }
        ],
        totalCustomerQuote: 3250.00,
        createdAt: '2026-10-07T09:00:00.000Z'
      }
    ]
  },
  {
    id: 'team_hort_02',
    name: 'GreenEarth Horticulture & Acreage Tree Works',
    sector: 'horticulture',
    sectorLabel: 'Horticulture & Landscaping',
    sectorIcon: 'fa-tree',
    ownerType: 'franchise',
    ownerId: 'FRAN-JIM-01',
    ownerName: "Jim's Mowing & Tree Care Regional Franchise",
    description: 'Commercial tree lopping, chipper fleet, precision hedging, and landscape rehabilitation team.',
    createdAt: '2026-10-02T09:30:00.000Z',
    personInCharge: {
      spn: 'SPN-101006',
      name: 'Chloe Bennett',
      title: 'Lead Arborist & Person in Charge (PIC)',
      phone: '0418 223 344',
      email: 'chloe.bennett.arborist@gmail.com',
      avatar: 'assets/images/tradie_worker.jpg',
      trade: 'Cert III Arboriculture & Climber'
    },
    members: [
      {
        spn: 'SPN-101006',
        name: 'Chloe Bennett',
        trade: 'Cert III Arborist',
        role: 'Person in Charge (Lead Arborist)',
        phone: '0418 223 344',
        email: 'chloe.bennett.arborist@gmail.com',
        avatar: 'assets/images/tradie_worker.jpg',
        pricingRate: 95,
        pricingUnit: 'hourly',
        isPic: true,
        status: 'active'
      },
      {
        spn: 'SPN-101007',
        name: "Tom 'Spud' Murphy",
        trade: 'Chainsaw & Chipper Operator',
        role: 'Heavy Wood Chipper Specialist',
        phone: '0419 778 899',
        email: 'tom.murphy.chipper@gmail.com',
        avatar: 'assets/images/tradie_worker.jpg',
        pricingRate: 75,
        pricingUnit: 'hourly',
        isPic: false,
        status: 'active'
      },
      {
        spn: 'SPN-101008',
        name: "Liam O'Connor",
        trade: 'Horticulturalist & Grounds Tech',
        role: 'Groundsman & Cleanup Lead',
        phone: '0420 334 455',
        email: 'liam.horticulture@gmail.com',
        avatar: 'assets/images/tradie_worker.jpg',
        pricingRate: 65,
        pricingUnit: 'hourly',
        isPic: false,
        status: 'active'
      }
    ],
    chatMessages: [
      {
        id: 'msg_h1',
        senderSpn: 'SPN-101006',
        senderName: 'Chloe Bennett',
        senderRole: 'Person In Charge',
        senderAvatar: 'assets/images/tradie_worker.jpg',
        timestamp: '2026-10-06 02:15 PM',
        messageType: 'safety',
        text: 'Council permit confirmed for the tall gum canopy reduction at 88 Tamborine Rd. Exclusion drop-zone tape is mandatory.'
      },
      {
        id: 'msg_h2',
        senderSpn: 'SPN-101007',
        senderName: "Tom 'Spud' Murphy",
        senderRole: 'Heavy Wood Chipper Specialist',
        senderAvatar: 'assets/images/tradie_worker.jpg',
        timestamp: '2026-10-06 02:40 PM',
        messageType: 'general',
        text: 'Bandit 15-inch chipper is fueled and blades sharpened this morning. Ready for heavy branches.'
      }
    ],
    jobs: [
      {
        id: 'JOB-9042',
        title: 'Emergency Storm-Damaged Tree Removal & Woodchipping',
        workRequired: 'Aerial rigging removal of overhanging ironbark branch near powerlines, mulching of canopy waste, and yard clearing.',
        location: '88 Tamborine Way, Mount Tamborine QLD',
        jobDate: '2026-10-16',
        jobTime: '08:00 AM',
        estimatedHours: 6,
        status: 'scheduled',
        createdBy: 'Chloe Bennett (PIC)',
        isFranchise: true,
        franchiseName: "Jim's Mowing & Tree Care Regional Franchise",
        franchiseMarginPercent: 12,
        franchiseCutAmount: 194.40,
        assignedMembers: [
          { spn: 'SPN-101006', name: 'Chloe Bennett', trade: 'Lead Climber', role: 'Aerial Tree Rigging', pricing: 95, pricingType: 'hourly', estimatedPayout: 570, notes: 'Rig branches down with lowering ropes' },
          { spn: 'SPN-101007', name: "Tom 'Spud' Murphy", trade: 'Chipper Operator', role: 'Woodchipping & Log Processing', pricing: 75, pricingType: 'hourly', estimatedPayout: 450, notes: 'Process mulch directly into tipper bin' },
          { spn: 'SPN-101008', name: "Liam O'Connor", trade: 'Groundsman', role: 'Drop Zone Safety & Blow-down', pricing: 65, pricingType: 'hourly', estimatedPayout: 390, notes: 'Keep driveway clear for residents' }
        ],
        totalCustomerQuote: 1814.40,
        createdAt: '2026-10-06T10:00:00.000Z'
      }
    ]
  },
  {
    id: 'team_mach_03',
    name: 'Pacific Heavy Earthmoving & Plant Fleet',
    sector: 'machinery',
    sectorLabel: 'Heavy Machinery & Earthmoving',
    sectorIcon: 'fa-truck-front',
    ownerType: 'franchise',
    ownerId: 'FRAN-COAST-02',
    ownerName: 'Pacific Hire & Civil Franchise Network',
    description: '14t Excavator, Positrack Bobcat, and 10m Tipper fleet for civil drainage, site cuts, and pool excavations.',
    createdAt: '2026-10-03T11:00:00.000Z',
    personInCharge: {
      spn: 'SPN-101005',
      name: 'Marco Rossi',
      title: 'Excavation Supervisor & Person in Charge (PIC)',
      phone: '0411 990 011',
      email: 'marco.rossi.earthmoving@gmail.com',
      avatar: 'assets/images/tradie_worker.jpg',
      trade: 'Civil Earthmoving Operator Ticketed'
    },
    members: [
      {
        spn: 'SPN-101005',
        name: 'Marco Rossi',
        trade: 'Excavator Specialist',
        role: 'Person in Charge (14t Operator)',
        phone: '0411 990 011',
        email: 'marco.rossi.earthmoving@gmail.com',
        avatar: 'assets/images/tradie_worker.jpg',
        pricingRate: 110,
        pricingUnit: 'hourly',
        isPic: true,
        status: 'active'
      },
      {
        spn: 'SPN-101009',
        name: 'Brad Evans',
        trade: 'Bobcat / Positrack Operator',
        role: 'Track Loader & Grading Specialist',
        phone: '0422 445 566',
        email: 'brad.evans.bobcat@gmail.com',
        avatar: 'assets/images/tradie_worker.jpg',
        pricingRate: 95,
        pricingUnit: 'hourly',
        isPic: false,
        status: 'active'
      },
      {
        spn: 'SPN-101010',
        name: 'Jason Taylor',
        trade: 'Heavy Rigid Tipper Driver',
        role: 'Soil Cartage & Spoil Disposal',
        phone: '0423 778 899',
        email: 'jason.tippers@gmail.com',
        avatar: 'assets/images/tradie_worker.jpg',
        pricingRate: 85,
        pricingUnit: 'hourly',
        isPic: false,
        status: 'active'
      }
    ],
    chatMessages: [
      {
        id: 'msg_m1',
        senderSpn: 'SPN-101005',
        senderName: 'Marco Rossi',
        senderRole: 'Person In Charge',
        senderAvatar: 'assets/images/tradie_worker.jpg',
        timestamp: '2026-10-07 06:10 AM',
        messageType: 'safety',
        text: 'DBYD (Dial Before You Dig) utility plans confirmed. Gas line is 1.8m deep along boundary. Hand dig within 500mm.'
      },
      {
        id: 'msg_m2',
        senderSpn: 'SPN-101010',
        senderName: 'Jason Taylor',
        senderRole: 'Soil Cartage & Spoil Disposal',
        senderAvatar: 'assets/images/tradie_worker.jpg',
        timestamp: '2026-10-07 06:30 AM',
        messageType: 'general',
        text: 'Tipper truck has green slip from recycling depot. Tipping vouchers active.'
      }
    ],
    jobs: [
      {
        id: 'JOB-9043',
        title: 'Deep Stormwater Trench Excavation & Clay Spoil Removal',
        workRequired: 'Excavation of 45m trench at 1.4m depth with laser dual slope grade, bedding sand backfill, and 6 truckloads of spoil cartage.',
        location: '120 Bundall Rd, Bundall QLD',
        jobDate: '2026-10-19',
        jobTime: '06:30 AM',
        estimatedHours: 8,
        status: 'scheduled',
        createdBy: 'Marco Rossi (PIC)',
        isFranchise: true,
        franchiseName: 'Pacific Hire & Civil Franchise Network',
        franchiseMarginPercent: 10,
        franchiseCutAmount: 232.00,
        assignedMembers: [
          { spn: 'SPN-101005', name: 'Marco Rossi', trade: '14t Excavator', role: 'Trenching with Laser Grading', pricing: 110, pricingType: 'hourly', estimatedPayout: 880, notes: 'Maintain 1.5% fall to council main' },
          { spn: 'SPN-101009', name: 'Brad Evans', trade: 'Positrack', role: 'Sand Bedding & Shoring Setup', pricing: 95, pricingType: 'hourly', estimatedPayout: 760, notes: 'Move bedding sand along trench edge' },
          { spn: 'SPN-101010', name: 'Jason Taylor', trade: 'Tipper Driver', role: 'Bulk Haulage to Stapylton Quarry', pricing: 85, pricingType: 'hourly', estimatedPayout: 680, notes: '6 runs estimated' }
        ],
        totalCustomerQuote: 2552.00,
        createdAt: '2026-10-07T08:30:00.000Z'
      }
    ]
  }
];

class WorkTeamsService {
  constructor() {
    this.initStorage();
  }

  initStorage() {
    try {
      const existing = localStorage.getItem(WORK_TEAMS_STORAGE_KEY);
      if (!existing) {
        localStorage.setItem(WORK_TEAMS_STORAGE_KEY, JSON.stringify(SEED_WORK_TEAMS));
      }
    } catch (e) {
      console.warn('Error initializing work teams storage:', e);
    }
  }

  getAllTeams(filter = {}) {
    try {
      const data = JSON.parse(localStorage.getItem(WORK_TEAMS_STORAGE_KEY) || '[]');
      if (filter.sector && filter.sector !== 'all') {
        return data.filter(t => t.sector === filter.sector);
      }
      if (filter.ownerType && filter.ownerType !== 'all') {
        return data.filter(t => t.ownerType === filter.ownerType);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        return data.filter(t => 
          t.name.toLowerCase().includes(q) || 
          t.description.toLowerCase().includes(q) ||
          (t.personInCharge?.name || '').toLowerCase().includes(q)
        );
      }
      return data;
    } catch (e) {
      console.warn('Error reading work teams:', e);
      return SEED_WORK_TEAMS;
    }
  }

  getTeamById(id) {
    const teams = this.getAllTeams();
    return teams.find(t => t.id === id) || null;
  }

  saveAllTeams(teams) {
    try {
      localStorage.setItem(WORK_TEAMS_STORAGE_KEY, JSON.stringify(teams));
      // Dispatch custom event for real-time reactive sync across panels
      window.dispatchEvent(new CustomEvent('iasj:workteams:updated', { detail: { teams } }));
      return true;
    } catch (e) {
      console.error('Error saving work teams:', e);
      return false;
    }
  }

  createTeam(teamData) {
    const teams = this.getAllTeams();
    const id = 'team_' + Date.now();
    const newTeam = {
      id,
      name: teamData.name || 'Untitled Multi-Person Crew',
      sector: teamData.sector || 'construction',
      sectorLabel: this.getSectorLabel(teamData.sector || 'construction'),
      sectorIcon: this.getSectorIcon(teamData.sector || 'construction'),
      ownerType: teamData.ownerType || 'provider',
      ownerId: teamData.ownerId || 'SPN-CURRENT',
      ownerName: teamData.ownerName || 'Lead Provider',
      description: teamData.description || 'Specialized multi-person work team.',
      createdAt: new Date().toISOString(),
      personInCharge: teamData.personInCharge || {
        spn: 'SPN-LEAD',
        name: 'Team Leader',
        title: 'Person in Charge (PIC)',
        phone: '0400 000 000',
        email: 'lead@example.com',
        avatar: 'assets/images/tradie_worker.jpg'
      },
      members: teamData.members || [],
      chatMessages: [
        {
          id: 'msg_welcome_' + Date.now(),
          senderSpn: teamData.personInCharge?.spn || 'SPN-LEAD',
          senderName: teamData.personInCharge?.name || 'Person in Charge',
          senderRole: 'Person In Charge',
          senderAvatar: teamData.personInCharge?.avatar || 'assets/images/tradie_worker.jpg',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
          messageType: 'general',
          text: `Welcome to the ${teamData.name || 'Work Team'} communication board! Team members can post site updates, hazard alerts, and job coordination notes here.`
        }
      ],
      jobs: []
    };

    teams.unshift(newTeam);
    this.saveAllTeams(teams);
    return newTeam;
  }

  updateTeam(id, updates) {
    const teams = this.getAllTeams();
    const idx = teams.findIndex(t => t.id === id);
    if (idx === -1) return null;
    teams[idx] = { ...teams[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveAllTeams(teams);
    return teams[idx];
  }

  deleteTeam(id) {
    const teams = this.getAllTeams();
    const filtered = teams.filter(t => t.id !== id);
    this.saveAllTeams(filtered);
    return true;
  }

  addMemberToTeam(teamId, memberData) {
    const team = this.getTeamById(teamId);
    if (!team) return false;
    
    // Check if member already in team
    if (team.members.some(m => m.spn === memberData.spn)) {
      throw new Error(`Member with SPN ${memberData.spn} is already part of this work team.`);
    }

    const member = {
      spn: memberData.spn || ('SPN-' + Math.floor(100000 + Math.random() * 900000)),
      name: memberData.name || 'Registered Member',
      trade: memberData.trade || 'Tradesperson',
      role: memberData.role || 'Crew Member',
      phone: memberData.phone || '0400 000 000',
      email: memberData.email || 'member@example.com',
      avatar: memberData.avatar || 'assets/images/tradie_worker.jpg',
      pricingRate: parseFloat(memberData.pricingRate) || 85.00,
      pricingUnit: memberData.pricingUnit || 'hourly',
      isPic: !!memberData.isPic,
      status: 'active',
      addedAt: new Date().toISOString()
    };

    team.members.push(member);

    // If marked as PIC, update team Person in Charge
    if (member.isPic) {
      team.personInCharge = {
        spn: member.spn,
        name: member.name,
        title: member.role || 'Person in Charge (PIC)',
        phone: member.phone,
        email: member.email,
        avatar: member.avatar,
        trade: member.trade
      };
      // Reset other members isPic
      team.members.forEach(m => { if (m.spn !== member.spn) m.isPic = false; });
    }

    // Add notification in chat
    team.chatMessages.push({
      id: 'msg_join_' + Date.now(),
      senderSpn: 'SYSTEM',
      senderName: 'System Bot',
      senderRole: 'Notice',
      senderAvatar: 'assets/images/tradie_worker.jpg',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
      messageType: 'general',
      text: `👷 Registered member ${member.name} (${member.trade}, ${member.spn}) has joined the work team roster as '${member.role}'.`
    });

    this.updateTeam(teamId, { members: team.members, personInCharge: team.personInCharge, chatMessages: team.chatMessages });
    return member;
  }

  removeMemberFromTeam(teamId, memberSpn) {
    const team = this.getTeamById(teamId);
    if (!team) return false;
    
    const removedMember = team.members.find(m => m.spn === memberSpn);
    team.members = team.members.filter(m => m.spn !== memberSpn);

    if (removedMember) {
      team.chatMessages.push({
        id: 'msg_rem_' + Date.now(),
        senderSpn: 'SYSTEM',
        senderName: 'System Notice',
        senderRole: 'Notice',
        senderAvatar: 'assets/images/tradie_worker.jpg',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
        messageType: 'general',
        text: `Member ${removedMember.name} (${removedMember.spn}) has left the team roster.`
      });
    }

    this.updateTeam(teamId, { members: team.members, chatMessages: team.chatMessages });
    return true;
  }

  setPersonInCharge(teamId, memberSpn) {
    const team = this.getTeamById(teamId);
    if (!team) return false;

    const target = team.members.find(m => m.spn === memberSpn);
    if (!target) return false;

    team.members.forEach(m => m.isPic = (m.spn === memberSpn));
    team.personInCharge = {
      spn: target.spn,
      name: target.name,
      title: `${target.trade} (Person In Charge)`,
      phone: target.phone,
      email: target.email,
      avatar: target.avatar,
      trade: target.trade
    };

    team.chatMessages.push({
      id: 'msg_pic_' + Date.now(),
      senderSpn: 'SYSTEM',
      senderName: 'System Notice',
      senderRole: 'Notice',
      senderAvatar: 'assets/images/tradie_worker.jpg',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
      messageType: 'safety',
      text: `⭐ ${target.name} has been designated as the PERSON IN CHARGE (PIC) for this work team.`
    });

    this.updateTeam(teamId, { members: team.members, personInCharge: team.personInCharge, chatMessages: team.chatMessages });
    return team.personInCharge;
  }

  sendTeamMessage(teamId, messagePayload) {
    const team = this.getTeamById(teamId);
    if (!team) return false;

    const msg = {
      id: 'msg_' + Date.now(),
      senderSpn: messagePayload.senderSpn || 'SPN-ANON',
      senderName: messagePayload.senderName || 'Crew Member',
      senderRole: messagePayload.senderRole || 'Tradie',
      senderAvatar: messagePayload.senderAvatar || 'assets/images/tradie_worker.jpg',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
      messageType: messagePayload.messageType || 'general',
      text: messagePayload.text || ''
    };

    if (!team.chatMessages) team.chatMessages = [];
    team.chatMessages.push(msg);

    this.updateTeam(teamId, { chatMessages: team.chatMessages });
    return msg;
  }

  createTeamJob(teamId, jobData) {
    const team = this.getTeamById(teamId);
    if (!team) return false;

    const jobId = 'JOB-' + Math.floor(1000 + Math.random() * 9000);
    
    // Calculate total payouts for assigned members
    let totalProviderPayout = 0;
    const assignedWithCalc = (jobData.assignedMembers || []).map(m => {
      const hours = parseFloat(jobData.estimatedHours) || 8;
      const rate = parseFloat(m.pricing) || 85;
      const isFixed = m.pricingType === 'fixed';
      const payout = isFixed ? rate : (rate * hours);
      totalProviderPayout += payout;
      return {
        ...m,
        pricing: rate,
        pricingType: m.pricingType || 'hourly',
        estimatedPayout: payout
      };
    });

    // If franchise job, compute franchise margin / cut
    const isFranchise = !!jobData.isFranchise;
    const marginPercent = parseFloat(jobData.franchiseMarginPercent) || (isFranchise ? 12 : 0);
    const franchiseCut = isFranchise ? (totalProviderPayout * (marginPercent / 100)) : 0;
    const totalQuote = totalProviderPayout + franchiseCut;

    const newJob = {
      id: jobId,
      title: jobData.title || 'Multi-Person Scheduled Work',
      workRequired: jobData.workRequired || '',
      location: jobData.location || 'Site Address',
      jobDate: jobData.jobDate || new Date().toISOString().split('T')[0],
      jobTime: jobData.jobTime || '07:30 AM',
      estimatedHours: parseFloat(jobData.estimatedHours) || 8,
      status: 'scheduled',
      createdBy: `${team.personInCharge?.name || 'Person In Charge'} (PIC)`,
      isFranchise: isFranchise,
      franchiseName: jobData.franchiseName || (isFranchise ? team.ownerName : ''),
      franchiseMarginPercent: marginPercent,
      franchiseCutAmount: parseFloat(franchiseCut.toFixed(2)),
      assignedMembers: assignedWithCalc,
      totalCustomerQuote: parseFloat(totalQuote.toFixed(2)),
      createdAt: new Date().toISOString()
    };

    if (!team.jobs) team.jobs = [];
    team.jobs.unshift(newJob);

    // Broadcast in team chat
    team.chatMessages.push({
      id: 'msg_job_' + Date.now(),
      senderSpn: team.personInCharge?.spn || 'PIC',
      senderName: team.personInCharge?.name || 'Person in Charge',
      senderRole: 'Person In Charge',
      senderAvatar: team.personInCharge?.avatar || 'assets/images/tradie_worker.jpg',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
      messageType: 'general',
      text: `📋 NEW WORK DISPATCHED [${newJob.id}]: "${newJob.title}" for ${newJob.jobDate} at ${newJob.jobTime}. Assigned: ${newJob.assignedMembers.map(a => `${a.name} ($${a.pricing}/${a.pricingType})`).join(', ')}. Scope: ${newJob.workRequired}`
    });

    this.updateTeam(teamId, { jobs: team.jobs, chatMessages: team.chatMessages });
    return newJob;
  }

  updateJobStatus(teamId, jobId, newStatus) {
    const team = this.getTeamById(teamId);
    if (!team || !team.jobs) return false;

    const job = team.jobs.find(j => j.id === jobId);
    if (!job) return false;

    job.status = newStatus;

    team.chatMessages.push({
      id: 'msg_status_' + Date.now(),
      senderSpn: team.personInCharge?.spn || 'PIC',
      senderName: team.personInCharge?.name || 'Person In Charge',
      senderRole: 'Person In Charge',
      senderAvatar: team.personInCharge?.avatar || 'assets/images/tradie_worker.jpg',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
      messageType: newStatus === 'completed' ? 'safety' : 'general',
      text: `🔔 Job ${job.id} status updated to: ${newStatus.toUpperCase()}`
    });

    this.updateTeam(teamId, { jobs: team.jobs, chatMessages: team.chatMessages });
    return job;
  }

  deleteJob(teamId, jobId) {
    const team = this.getTeamById(teamId);
    if (!team || !team.jobs) return false;

    team.jobs = team.jobs.filter(j => j.id !== jobId);
    this.updateTeam(teamId, { jobs: team.jobs });
    return true;
  }

  // Get all registered members available to add to a team
  getAvailableRegisteredMembers() {
    const registered = [];
    const seenSpns = new Set();

    // 1. From window.providerDB
    if (window.providerDB && typeof window.providerDB.getAll === 'function') {
      const providers = window.providerDB.getAll();
      providers.forEach(p => {
        const spn = p.serviceProviderNumber || p.id;
        if (!seenSpns.has(spn)) {
          seenSpns.add(spn);
          registered.push({
            spn: spn,
            name: p.name,
            trade: p.tradeTitle || (p.category ? p.category.toUpperCase() : 'General Tradie'),
            category: p.category || 'construction',
            phone: p.phone || '0412 000 111',
            email: p.email || `${p.name.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
            hourlyRate: p.hourlyRate || 95,
            rating: p.rating || 4.9,
            avatar: p.avatar || 'assets/images/tradie_worker.jpg',
            source: 'Verified Provider DB'
          });
        }
      });
    }

    // 2. From Franchise Staff in localStorage
    try {
      const staffList = JSON.parse(localStorage.getItem('iasj_franchise_staff') || '[]');
      staffList.forEach(s => {
        const spn = s.id || s.spn;
        if (spn && !seenSpns.has(spn)) {
          seenSpns.add(spn);
          registered.push({
            spn: spn,
            name: s.name,
            trade: s.tradeTitle || (s.category ? s.category.toUpperCase() + ' Specialist' : 'Franchise Staff'),
            category: s.category || 'construction',
            phone: s.phone || '0400 123 456',
            email: s.email || 'staff@franchise.com',
            hourlyRate: 85,
            rating: 5.0,
            avatar: 'assets/images/tradie_worker.jpg',
            source: 'Franchise Staff Member'
          });
        }
      });
    } catch (e) {}

    // 3. Fallback verified platform members if DB is empty
    if (registered.length === 0) {
      const seedProviders = [
        { spn: 'SPN-101001', name: "Lachlan 'Lockie' Miller", trade: 'Licensed Master Plumber & Gas Fitter', category: 'construction', phone: '0412 345 678', email: 'lockie@trades.com', hourlyRate: 98, rating: 4.95, avatar: 'assets/images/tradie_worker.jpg', source: 'Platform Tradie' },
        { spn: 'SPN-101002', name: 'Jack Morrison', trade: 'Formwork & Structural Concreter', category: 'construction', phone: '0421 987 654', email: 'jack@trades.com', hourlyRate: 90, rating: 4.92, avatar: 'assets/images/tradie_worker.jpg', source: 'Platform Tradie' },
        { spn: 'SPN-101003', name: "Mitch 'Sully' Sullivan", trade: 'Steel Fixer & Rebar Technician', category: 'construction', phone: '0433 112 233', email: 'mitch@trades.com', hourlyRate: 85, rating: 4.88, avatar: 'assets/images/tradie_worker.jpg', source: 'Platform Tradie' },
        { spn: 'SPN-101005', name: 'Marco Rossi', trade: 'Civil Heavy Plant & Excavator Operator', category: 'machinery', phone: '0411 990 011', email: 'marco@earthmoving.com', hourlyRate: 110, rating: 4.98, avatar: 'assets/images/tradie_worker.jpg', source: 'Platform Tradie' },
        { spn: 'SPN-101006', name: 'Chloe Bennett', trade: 'Level 5 Certified Arborist & Climber', category: 'horticulture', phone: '0418 223 344', email: 'chloe@arborist.com', hourlyRate: 95, rating: 4.96, avatar: 'assets/images/tradie_worker.jpg', source: 'Platform Tradie' },
        { spn: 'SPN-101007', name: "Tom 'Spud' Murphy", trade: 'Heavy Wood Chipper & Chainsaw Operator', category: 'horticulture', phone: '0419 778 899', email: 'tom@treeworks.com', hourlyRate: 75, rating: 4.85, avatar: 'assets/images/tradie_worker.jpg', source: 'Platform Tradie' },
        { spn: 'SPN-101009', name: 'Brad Evans', trade: 'Bobcat, Positrack & Laser Grader', category: 'machinery', phone: '0422 445 566', email: 'brad@bobcat.com', hourlyRate: 95, rating: 4.90, avatar: 'assets/images/tradie_worker.jpg', source: 'Platform Tradie' },
        { spn: 'SPN-101010', name: 'Jason Taylor', trade: 'Heavy Rigid Tipper Driver & Haulage', category: 'machinery', phone: '0423 778 899', email: 'jason@tippers.com', hourlyRate: 85, rating: 4.87, avatar: 'assets/images/tradie_worker.jpg', source: 'Platform Tradie' }
      ];
      return seedProviders;
    }

    return registered;
  }

  getSectorLabel(sector) {
    const map = {
      construction: 'Construction & Civil',
      horticulture: 'Horticulture & Landscaping',
      machinery: 'Heavy Machinery & Earthmoving',
      electrical: 'Electrical & Solar',
      plumbing: 'Plumbing & Drainage',
      cleaning: 'Commercial Cleaning & Remediation',
      logistics: 'Logistics, Transport & Removals',
      general: 'Multi-Discipline Trade Team'
    };
    return map[sector] || 'Specialized Work Team';
  }

  getSectorIcon(sector) {
    const map = {
      construction: 'fa-trowel-bricks',
      horticulture: 'fa-tree',
      machinery: 'fa-truck-front',
      electrical: 'fa-bolt',
      plumbing: 'fa-faucet-drip',
      cleaning: 'fa-broom',
      logistics: 'fa-boxes-packing',
      general: 'fa-users-gear'
    };
    return map[sector] || 'fa-users-gear';
  }
}

// Instantiate and expose globally
window.workTeamsService = new WorkTeamsService();
export default window.workTeamsService;
