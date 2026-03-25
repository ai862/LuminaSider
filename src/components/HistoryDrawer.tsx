import { isToday, isYesterday, isThisWeek } from 'date-fns';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { useStore, Session } from '../store';

export function HistoryDrawer() {
  const { 
    isDrawerOpen, 
    setIsDrawerOpen, 
    sessions, 
    currentSessionId, 
    createNewSession, 
    switchSession, 
    deleteSession 
  } = useStore();

  if (!isDrawerOpen) return null;

  // Group sessions
  const groupedSessions = sessions.reduce((acc, session) => {
    const date = new Date(session.updatedAt);
    let group = '更早';
    
    if (isToday(date)) group = '今天';
    else if (isYesterday(date)) group = '昨天';
    else if (isThisWeek(date)) group = '过去 7 天';

    if (!acc[group]) acc[group] = [];
    acc[group].push(session);
    return acc;
  }, {} as Record<string, Session[]>);

  const groups = ['今天', '昨天', '过去 7 天', '更早'].filter(g => groupedSessions[g]);

  return (
    <>
      <div 
        className="absolute inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={() => setIsDrawerOpen(false)}
      />
      
      <div className="absolute top-0 left-0 bottom-0 z-50 w-3/4 max-w-[280px] bg-white dark:bg-primary shadow-2xl flex flex-col transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={() => createNewSession()}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            <Plus className="w-4 h-4" />
            新建对话
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-6">
          {groups.length === 0 ? (
            <div className="text-center text-sm text-slate-400 mt-10">
              暂无对话记录
            </div>
          ) : (
            groups.map(group => (
              <div key={group} className="space-y-1">
                <div className="px-2 pb-1 text-[10px] font-medium tracking-wider uppercase text-slate-400">
                  {group}
                </div>
                {groupedSessions[group].map(session => (
                  <div
                    key={session.id}
                    onClick={() => switchSession(session.id)}
                    className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      currentSessionId === session.id
                        ? 'bg-slate-100 dark:bg-slate-800'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <MessageSquare className={`w-4 h-4 shrink-0 ${
                      currentSessionId === session.id ? 'text-blue-500' : 'text-slate-400'
                    }`} />
                    <div className="flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                      {session.title}
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('确定要删除此对话吗？')) {
                          deleteSession(session.id);
                        }
                      }}
                      className="absolute right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
