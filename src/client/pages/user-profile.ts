// @ts-nocheck — user-profile.html 인라인 스크립트 이관(동작 보존). common.ts 와 동일 사유로 타입검사 비활성.
//
// 이관 규칙:
//  - common.ts 가 window.* 로 노출하는 공통 전역(loadConfig / currentUser /
//    loadNotificationCount / escapeHtml / appConfig)은 모듈 스코프에서 bare 식별자로
//    해석되지 않으므로 모두 window.* 로 접근한다.
//  - CDN 전역(Swal)은 그대로 둔다.
//  - HTML on* 속성에서 호출되는 함수는 파일 끝에서 window.* 로 노출한다.

import { renderUserAvatar } from '../utils/avatar';

let profileUser = null;
let contributionsPage = 1;
let contributionsTotal = 0;
let contributionsRequestSeq = 0;
const PAGE_SIZE = 20;

// URL에서 유저 ID 추출
function getUserIdFromUrl() {
    const match = window.location.pathname.match(/^\/profile\/([1-9A-HJ-NP-Za-km-z]{22})$/);
    return match?.[1] || null;
}

document.addEventListener('DOMContentLoaded', async () => {
    await window.loadConfig();
    const userId = getUserIdFromUrl();
    if (!userId) {
        document.getElementById('profileHeader').innerHTML =
            '<div class="text-center text-muted py-3">유효하지 않은 사용자 ID입니다.</div>';
        return;
    }

    try {
        // 동시에 checkAuth와 fetchProfile 호출
        const [authRes, res] = await Promise.all([
            fetch('/api/me').catch(() => null),
            fetch(`/api/users/${userId}/profile`)
        ]);

        if (authRes && authRes.ok) {
            window.currentUser = await authRes.json();
            document.querySelectorAll('#navLogin').forEach(el => el.classList.add('d-none'));
            document.querySelectorAll('#navUser').forEach(el => el.classList.remove('d-none'));
            document.querySelectorAll('#userAvatar').forEach(el => {
                el.innerHTML = renderUserAvatar(window.currentUser.picture, window.currentUser.name, 32, 'user-avatar m-0');
            });
            document.querySelectorAll('#userName').forEach(el => el.textContent = window.currentUser.name);

            if (window.currentUser.role === 'admin' || window.currentUser.role === 'super_admin') {
                document.querySelectorAll('#navAdminConsole, #navAdminDivider').forEach(el => el.classList.remove('d-none'));
            }

            // 알림 버튼 표시
            document.querySelectorAll('#notificationBtnWrapper').forEach(el => el.classList.remove('d-none'));
            window.loadNotificationCount();
        }

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || '사용자를 찾을 수 없습니다.');
        }
        profileUser = await res.json();
        renderProfile();
        loadContributions();
    } catch (e) {
        document.getElementById('profileHeader').innerHTML =
            `<div class="text-center text-muted py-3">${window.escapeHtml(e.message)}</div>`;
    }
});

async function renderProfile() {
    const header = document.getElementById('profileHeader');

    const joinDate = profileUser.created_at
        ? new Date(profileUser.created_at * 1000).toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'long', day: 'numeric'
        })
        : '알 수 없음';

    const avatarHtml = renderUserAvatar(profileUser.picture, profileUser.name, 80, 'profile-avatar-placeholder');
    const profileBadges = [];
    if (profileUser.trusted_contributor) {
        profileBadges.push('<span class="badge bg-success" title="자신의 편집을 등록 요청 없이 바로 반영할 수 있습니다."><i class="mdi mdi-account-check-outline" aria-hidden="true"></i> 신뢰 기여자</span>');
    }
    for (const badge of profileUser.badges || []) {
        profileBadges.push(`<span class="badge ${window.escapeHtml(badge.className)}" title="${window.escapeHtml(badge.description)}"><i class="${window.escapeHtml(badge.icon)}" aria-hidden="true"></i> ${window.escapeHtml(badge.label)}</span>`);
    }

    // 쪽지 보내기 버튼 표시 여부
    let sendMsgBtn = '';
    if (window.currentUser && window.currentUser.id !== profileUser.id) {
        if (window.currentUser.role === 'banned') {
            // 차단 사용자: 소명(이의제기) 채널로 관리자에게만 쪽지 발송 가능.
            // 공개 프로필은 role 을 숨기므로 안전한 is_admin 플래그로 관리자 여부를 판단한다.
            if (profileUser.is_admin) {
                sendMsgBtn = `<button class="btn btn-sm btn-outline-primary mt-2" data-uid="${profileUser.id}" data-uname="${window.escapeHtml(profileUser.name)}" onclick="sendMessage(this.dataset.uid, this.dataset.uname)"><i class="mdi mdi-email-plus-outline"></i> 관리자에게 소명</button>`;
            }
        } else {
            try {
                const dmRes = await fetch('/api/settings/dm');
                const dmData = dmRes.ok ? await dmRes.json() : { allow_direct_message: 0 };
                const canBypassDm = ['admin', 'super_admin', 'discussion_manager'].includes(window.currentUser.role);

                if (dmData.allow_direct_message === 1 || canBypassDm) {
                    if (profileUser.role === 'deleted') {
                        sendMsgBtn = `<button class="btn btn-sm btn-outline-secondary mt-2" disabled><i class="mdi mdi-email-plus-outline"></i> 쪽지 보내기 (탈퇴한 사용자)</button>`;
                    } else {
                        sendMsgBtn = `<button class="btn btn-sm btn-outline-primary mt-2" data-uid="${profileUser.id}" data-uname="${window.escapeHtml(profileUser.name)}" onclick="sendMessage(this.dataset.uid, this.dataset.uname)"><i class="mdi mdi-email-plus-outline"></i> 쪽지 보내기</button>`;
                    }
                }
            } catch (e) { }
        }
    }

    header.innerHTML = `
        ${avatarHtml}
        <div class="profile-info">
            <h2>${window.escapeHtml(profileUser.name)}</h2>
            ${profileBadges.length ? `<div class="d-flex flex-wrap gap-2 mb-1">${profileBadges.join('')}</div>` : ''}
            <div class="text-muted"><i class="mdi mdi-calendar"></i> ${joinDate} 가입</div>
            <div class="d-flex flex-wrap gap-2 align-items-center">
                ${sendMsgBtn}
            </div>
        </div>
    `;

    document.title = `${profileUser.name} - 사용자 프로필 - ${window.appConfig.wikiName}`;
    renderAdminControls();
}

function renderAdminControls() {
    if (!window.currentUser) return;
    const isAdmin = window.currentUser.role === 'admin' || window.currentUser.role === 'super_admin';
    if (!isAdmin) return;

    const section = document.getElementById('adminControlsSection');
    const content = document.getElementById('adminControlsContent');
    section.style.display = '';

    const isSuperAdmin = window.currentUser.role === 'super_admin';
    const targetIsSuperAdmin = profileUser.role === 'super_admin';
    const isBanned = profileUser.banned_until && profileUser.banned_until * 1000 > Date.now();

    let html = '<div class="d-flex flex-wrap align-items-center gap-3">';

    // 차단 버튼
    const targetIsAdmin = profileUser.role === 'admin';
    if (targetIsSuperAdmin) {
        // super_admin은 제어 불가
        html += `<span class="badge bg-dark fs-6"><i class="mdi mdi-shield-crown"></i> 최고 관리자 (제어 불가)</span>`;
    } else if (!isSuperAdmin && targetIsAdmin) {
        // 일반 관리자는 다른 관리자를 차단할 수 없음
        html += `<span class="badge bg-secondary fs-6"><i class="mdi mdi-shield-account"></i> 관리자 (차단 불가)</span>`;
    } else {
        const banLabel = isBanned
            ? '<i class="mdi mdi-lock-open-outline"></i> 차단 해제'
            : '<i class="mdi mdi-block-helper"></i> 차단';
        const banClass = isBanned ? 'btn btn-outline-secondary' : 'btn btn-outline-danger';
        html += `<button class="${banClass}" onclick="adminBanUser()">${banLabel}</button>`;

        if (isBanned) {
            const until = new Date(profileUser.banned_until * 1000).toLocaleDateString('ko-KR');
            html += `<span class="badge bg-danger">차단 중 (~${until})</span>`;
        }
    }

    // 역할 변경 (super_admin 뷰어이고 대상이 super_admin이 아닌 경우)
    if (isSuperAdmin && !targetIsSuperAdmin) {
        html += `
            <div class="d-flex align-items-center gap-2 ms-auto">
                <label class="form-label mb-0 text-muted">역할:</label>
                <select class="form-select form-select-sm w-auto" onchange="adminChangeRole(this.value)">
                    <option value="user" ${profileUser.role === 'user' ? 'selected' : ''}>유저</option>
                    <option value="discussion_manager" ${profileUser.role === 'discussion_manager' ? 'selected' : ''}>토론 관리자</option>
                    <option value="admin" ${profileUser.role === 'admin' ? 'selected' : ''}>관리자</option>
                </select>
            </div>
        `;
    }

    html += '</div>';

    const trust = profileUser.trust;
    if (trust) {
        const policy = trust.policy;
        const statusClass = trust.trusted ? 'bg-success' : 'bg-secondary';
        const statusLabel = trust.trusted ? '신뢰 기여자' : '일반 기여자';
        const approvalRate = Math.round(Number(trust.approval_rate || 0) * 100);
        const cooldown = trust.cooldown_until > Math.floor(Date.now() / 1000)
            ? `<div class="small text-warning mt-1">재평가 대기: ${new Date(trust.cooldown_until * 1000).toLocaleDateString('ko-KR')}까지</div>`
            : '';
        html += `
            <hr>
            <div class="row g-3 align-items-start">
                <div class="col-12 col-lg-7">
                    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                        <strong>기여 신뢰</strong>
                        <span class="badge ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="d-flex flex-wrap gap-2 small text-muted" aria-label="신뢰 기여자 자동 평가 현황">
                        <span>승인 ${trust.approved}/${policy.minApprovedEdits}</span>
                        <span>문서 ${trust.distinct_documents}/${policy.minDistinctDocuments}</span>
                        <span>승인 기여일 ${trust.distinct_contribution_days}/${policy.minDistinctContributionDays}일</span>
                        <span>승인율 ${approvalRate}/${Math.round(policy.minApprovalRate * 100)}%</span>
                        <span>최근 문제 ${trust.problematic_recent}건</span>
                    </div>
                    ${cooldown}
                </div>
                <div class="col-12 col-lg-5">
                    <label class="form-label mb-1" for="contributorTrustMode">신뢰 모드</label>
                    <select id="contributorTrustMode" class="form-select" onchange="adminChangeTrustMode(this)">
                        <option value="auto" ${trust.mode === 'auto' ? 'selected' : ''}>자동 평가</option>
                        <option value="trusted" ${trust.mode === 'trusted' ? 'selected' : ''}>신뢰 기여자로 고정</option>
                        <option value="standard" ${trust.mode === 'standard' ? 'selected' : ''}>일반 기여자로 고정</option>
                    </select>
                    <div class="form-text">역할·전문 자격과 별개이며, 직접 게시 가능 여부만 정합니다.</div>
                </div>
                <div class="col-12 d-flex flex-wrap gap-2">
                    <button type="button" class="btn btn-outline-danger" onclick="adminRecordTrustIssue()"><i class="mdi mdi-alert-outline" aria-hidden="true"></i> 문제 기여 기록</button>
                </div>
            </div>
        `;
    }

    const assignedBadgeKeys = new Set((profileUser.badges || []).map(badge => badge.key));
    const badgeControls = (profileUser.available_badges || []).map((badge, index) => `
        <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" role="switch" id="userBadge${index}"
                data-badge-key="${window.escapeHtml(badge.key)}" ${assignedBadgeKeys.has(badge.key) ? 'checked' : ''}
                onchange="adminToggleBadge(this.dataset.badgeKey, this)">
            <label class="form-check-label" for="userBadge${index}"><i class="${window.escapeHtml(badge.icon)}" aria-hidden="true"></i> ${window.escapeHtml(badge.label)}</label>
            <div class="form-text">${window.escapeHtml(badge.description)}</div>
        </div>
    `).join('');
    html += `
        <hr>
        <div>
            <strong class="d-block mb-2">사용자 뱃지</strong>
            ${badgeControls || '<span class="small text-muted">사용 가능한 뱃지가 없습니다.</span>'}
            <div class="form-text">역할과 신뢰 상태에 관계없이 여러 뱃지를 부여할 수 있습니다.</div>
        </div>
    `;
    content.innerHTML = html;
}

async function adminBanUser() {
    const isBanned = profileUser.banned_until && profileUser.banned_until * 1000 > Date.now();
    const { value: days } = await Swal.fire({
        titleText: `${profileUser.name} 차단`,
        input: 'number',
        inputLabel: '차단 일수 (0 = 해제)',
        inputValue: isBanned ? 0 : 7,
        inputAttributes: { min: 0 },
        showCancelButton: true,
        cancelButtonText: '취소',
        confirmButtonText: '적용',
    });
    if (days === undefined) return;
    const res = await fetch(`/api/admin/users/${profileUser.id}/ban`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: Number(days) }),
    });
    const data = await res.json();
    if (res.ok) {
        profileUser.banned_until = data.banned_until;
        renderAdminControls();
    } else {
        Swal.fire('오류', data.error || '차단 실패', 'error');
    }
}

async function adminChangeRole(role) {
    const res = await fetch(`/api/admin/users/${profileUser.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (res.ok) {
        profileUser.role = role;
        renderAdminControls();
        Swal.fire({ icon: 'success', title: '변경됨', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
    } else {
        Swal.fire('오류', data.error || '변경 실패', 'error');
    }
}

async function adminChangeTrustMode(select) {
    const previous = profileUser.trust?.mode || 'auto';
    select.disabled = true;
    try {
        const res = await fetch(`/api/admin/users/${profileUser.id}/trust`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: select.value }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '변경 실패');
        profileUser.trust = data.summary;
        profileUser.trusted_contributor = data.summary.trusted;
        await renderProfile();
        Swal.fire({ icon: 'success', title: '신뢰 상태가 변경되었습니다.', toast: true, position: 'top-end', timer: 1800, showConfirmButton: false });
    } catch (error) {
        select.value = previous;
        select.disabled = false;
        Swal.fire('오류', error.message || '변경 실패', 'error');
    }
}

async function adminRecordTrustIssue() {
    const result = await Swal.fire({
        titleText: `${profileUser.name} 문제 기여 기록`,
        html: `
            <label for="trustIssueSeverity" class="form-label d-block text-start">문제 수준</label>
            <select id="trustIssueSeverity" class="form-select mb-3">
                <option value="problematic">문제 기여</option>
                <option value="severe">심각한 문제 기여</option>
            </select>
            <label for="trustIssueReason" class="form-label d-block text-start">사유</label>
            <textarea id="trustIssueReason" class="form-control" rows="4" maxlength="500"></textarea>
        `,
        showCancelButton: true,
        cancelButtonText: '취소',
        confirmButtonText: '기록',
        confirmButtonColor: '#dc3545',
        focusConfirm: false,
        preConfirm: () => {
            const severity = document.getElementById('trustIssueSeverity').value;
            const reason = document.getElementById('trustIssueReason').value.trim();
            if (!reason) {
                Swal.showValidationMessage('사유를 입력해주세요.');
                return false;
            }
            return { severity, reason };
        },
    });
    if (!result.value) return;

    const res = await fetch(`/api/admin/users/${profileUser.id}/trust-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.value),
    });
    const data = await res.json();
    if (!res.ok) {
        Swal.fire('오류', data.error || '기록 실패', 'error');
        return;
    }
    profileUser.trust = data.summary;
    profileUser.trusted_contributor = data.summary.trusted;
    await renderProfile();
    Swal.fire({ icon: 'success', title: '문제 기여를 기록했습니다.', toast: true, position: 'top-end', timer: 1800, showConfirmButton: false });
}

async function adminToggleBadge(badgeKey, input) {
    const enabled = input.checked;
    input.disabled = true;
    try {
        const res = await fetch(`/api/admin/users/${profileUser.id}/badges/${encodeURIComponent(badgeKey)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '변경 실패');
        profileUser.badges = data.badges;
        await renderProfile();
        Swal.fire({ icon: 'success', title: `뱃지를 ${enabled ? '부여' : '회수'}했습니다.`, toast: true, position: 'top-end', timer: 1800, showConfirmButton: false });
    } catch (error) {
        input.checked = !enabled;
        input.disabled = false;
        Swal.fire('오류', error.message || '변경 실패', 'error');
    }
}

async function loadContributions(page = 1) {
    const userId = getUserIdFromUrl();
    const listEl = document.getElementById('contributionsList');
    const paginationEl = document.getElementById('contributionsPagination');
    const isFirstLoad = contributionsTotal === 0 && page === 1;
    if (!isFirstLoad) {
        listEl.innerHTML = window.uiSkeletonList(5);
    }

    const seq = ++contributionsRequestSeq;
    const offset = (page - 1) * PAGE_SIZE;
    try {
        const res = await fetch(`/api/users/${userId}/contributions?offset=${offset}&limit=${PAGE_SIZE}`);
        if (seq !== contributionsRequestSeq) return;
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (seq !== contributionsRequestSeq) return;
        const contributions = data.contributions || [];
        const total = data.total || 0;
        renderTopicContributions(data.topic_contributions || []);

        contributionsTotal = total;

        // 통계 표시
        const statsSection = document.getElementById('statsSection');
        statsSection.style.display = '';
        document.getElementById('statCards').innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${contributionsTotal}</div>
                <div class="stat-label">총 편집 횟수</div>
            </div>
        `;

        // 기여 목록
        const section = document.getElementById('contributionsSection');
        section.style.display = '';

        if (total === 0) {
            contributionsPage = 1;
            listEl.innerHTML = window.uiEmptyState({ compact: true, icon: 'bi bi-inbox', title: '편집 내역이 없습니다' });
            paginationEl.innerHTML = '';
            return;
        }

        // 요청한 페이지가 범위를 벗어났으면 마지막 페이지로 보정해 재요청
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (contributions.length === 0 && page > totalPages) {
            loadContributions(totalPages);
            return;
        }

        contributionsPage = page;
        listEl.innerHTML = contributions.map(renderContribution).join('');
        renderContributionsPagination();

    } catch (e) {
        if (seq !== contributionsRequestSeq) return;
        listEl.innerHTML = window.uiEmptyState({ compact: true, icon: 'bi bi-exclamation-triangle', title: '불러오기 실패', text: '잠시 후 다시 시도해 주세요.' });
        paginationEl.innerHTML = '';
    }
}

function renderTopicContributions(topics) {
    const section = document.getElementById('topicContributionsSection');
    const list = document.getElementById('topicContributionsList');
    if (!topics.length) {
        section.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    section.style.display = '';
    list.innerHTML = topics.map(topic => `
        <div class="topic-contribution-card">
            <div class="topic-contribution-name">${window.escapeHtml(topic.category)}</div>
            <div class="topic-contribution-count"><strong>${Number(topic.document_count).toLocaleString()}</strong>개 문서</div>
        </div>
    `).join('');
}

function goToContributionsPage(page) {
    const totalPages = Math.max(1, Math.ceil(contributionsTotal / PAGE_SIZE));
    const target = Math.min(Math.max(1, page), totalPages);
    if (target === contributionsPage) return;
    loadContributions(target);
    document.getElementById('contributionsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getContributionsPageNumbers(current, total) {
    const pages = [];
    if (total <= 7) {
        for (let i = 1; i <= total; i++) pages.push(i);
        return pages;
    }
    pages.push(1);
    if (current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
}

function renderContributionsPagination() {
    const container = document.getElementById('contributionsPagination');
    const totalPages = Math.max(1, Math.ceil(contributionsTotal / PAGE_SIZE));
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    const pages = getContributionsPageNumbers(contributionsPage, totalPages);
    const isFirst = contributionsPage === 1;
    const isLast = contributionsPage === totalPages;

    let html = '<ul class="pagination pagination-sm justify-content-center mb-0 flex-wrap">';
    html += `<li class="page-item ${isFirst ? 'disabled' : ''}"><button type="button" class="page-link" onclick="goToContributionsPage(1)" ${isFirst ? 'disabled' : ''} aria-label="처음"><i class="mdi mdi-chevron-double-left"></i></button></li>`;
    html += `<li class="page-item ${isFirst ? 'disabled' : ''}"><button type="button" class="page-link" onclick="goToContributionsPage(${contributionsPage - 1})" ${isFirst ? 'disabled' : ''} aria-label="이전"><i class="mdi mdi-chevron-left"></i></button></li>`;
    for (const p of pages) {
        if (p === '...') {
            html += '<li class="page-item disabled"><span class="page-link">…</span></li>';
        } else {
            const active = p === contributionsPage ? 'active' : '';
            html += `<li class="page-item ${active}"><button type="button" class="page-link" onclick="goToContributionsPage(${p})">${p}</button></li>`;
        }
    }
    html += `<li class="page-item ${isLast ? 'disabled' : ''}"><button type="button" class="page-link" onclick="goToContributionsPage(${contributionsPage + 1})" ${isLast ? 'disabled' : ''} aria-label="다음"><i class="mdi mdi-chevron-right"></i></button></li>`;
    html += `<li class="page-item ${isLast ? 'disabled' : ''}"><button type="button" class="page-link" onclick="goToContributionsPage(${totalPages})" ${isLast ? 'disabled' : ''} aria-label="마지막"><i class="mdi mdi-chevron-double-right"></i></button></li>`;
    html += '</ul>';
    container.innerHTML = html;
}

function renderContribution(c) {
    const date = new Date(c.created_at * 1000).toLocaleString('ko-KR');
    const summaryHtml = c.summary
        ? `<span class="summary">- ${window.escapeHtml(c.summary)}</span>`
        : '<span class="summary text-muted">- (요약 없음)</span>';
    return `
        <div class="contribution-item">
            <div>
                <a href="/w/${encodeURIComponent(c.slug)}">${window.escapeHtml(c.slug)}</a>
                ${summaryHtml}
            </div>
            <span class="meta">${date}</span>
        </div>
    `;
}

// HTML on* 속성에서 호출되므로 window 로 노출
window.adminBanUser = adminBanUser;
window.adminChangeRole = adminChangeRole;
window.adminChangeTrustMode = adminChangeTrustMode;
window.adminRecordTrustIssue = adminRecordTrustIssue;
window.adminToggleBadge = adminToggleBadge;
window.goToContributionsPage = goToContributionsPage;
