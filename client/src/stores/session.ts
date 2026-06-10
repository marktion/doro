// Pinia Store - 会话管理
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SessionInfo } from '../types/agent';

export const useSessionStore = defineStore('session', () => {
  // 会话列表
  const sessions = ref<SessionInfo[]>([]);

  // 当前选中的会话
  const selectedSession = ref<SessionInfo | null>(null);

  // 加载状态
  const isLoading = ref(false);

  // 设置会话列表
  function setSessions(newSessions: SessionInfo[]) {
    sessions.value = newSessions;
  }

  // 选择会话
  function selectSession(session: SessionInfo) {
    selectedSession.value = session;
  }

  // 清除选中
  function clearSelection() {
    selectedSession.value = null;
  }

  // 删除会话
  function removeSession(sessionId: string) {
    sessions.value = sessions.value.filter(s => s.sessionId !== sessionId);
    if (selectedSession.value?.sessionId === sessionId) {
      selectedSession.value = null;
    }
  }

  // 按项目分组
  function getSessionsByProject(): Map<string, SessionInfo[]> {
    const grouped = new Map<string, SessionInfo[]>();
    for (const session of sessions.value) {
      const project = session.cwd || '未知项目';
      if (!grouped.has(project)) {
        grouped.set(project, []);
      }
      grouped.get(project)!.push(session);
    }
    return grouped;
  }

  return {
    sessions,
    selectedSession,
    isLoading,
    setSessions,
    selectSession,
    clearSelection,
    removeSession,
    getSessionsByProject
  };
});
