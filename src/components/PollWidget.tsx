import React from 'react';

export interface PollWidgetData {
  id: string;
  question: string;
  options: {
    id: string;
    option_text: string;
    votes_count: number;
  }[];
  user_voted_option_id?: string | null;
}

interface PollWidgetProps {
  poll: PollWidgetData;
  onVote: (optionId: string) => void;
  /** rend la version compacte pour les bulles de message */
  compact?: boolean;
}

export const PollWidget: React.FC<PollWidgetProps> = ({ poll, onVote, compact }) => {
  const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes_count, 0);
  const hasVoted = !!poll.user_voted_option_id;

  return (
    <div className={`${compact ? 'mt-2 p-3 rounded-xl' : 'mt-4 p-4.5 rounded-2xl'} bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-3`}>
      <h5 className="font-extrabold text-xs uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-1.5">
        📊 Sondage : {poll.question}
      </h5>

      <div className="space-y-2">
        {poll.options.map((option) => {
          const percent = totalVotes > 0 ? Math.round((option.votes_count / totalVotes) * 100) : 0;
          const isSelected = poll.user_voted_option_id === option.id;

          if (hasVoted) {
            return (
              <div key={option.id} className="relative p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 overflow-hidden flex items-center justify-between">
                <div
                  className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 ${
                    isSelected
                      ? 'bg-ios-blue-light/15 dark:bg-ios-blue-dark/25'
                      : 'bg-black/5 dark:bg-white/5'
                  }`}
                  style={{ width: `${percent}%` }}
                />
                <span className={`text-xs font-bold relative z-10 flex items-center gap-1.5 ${isSelected ? 'text-ios-blue-light dark:text-ios-blue-dark' : ''}`}>
                  {isSelected && <span className="text-xs">✓</span>}
                  {option.option_text}
                </span>
                <span className="text-xs font-extrabold relative z-10 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                  {percent}% ({option.votes_count} {option.votes_count > 1 ? 'votes' : 'vote'})
                </span>
              </div>
            );
          }
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onVote(option.id)}
              className="w-full text-left p-3 rounded-xl bg-white dark:bg-neutral-800 hover:bg-ios-blue-light/5 dark:hover:bg-ios-blue-dark/5 hover:border-ios-blue-light/35 border border-black/10 dark:border-white/5 text-xs font-bold transition-all active:scale-[0.99] flex items-center justify-between"
            >
              <span>{option.option_text}</span>
              <span className="text-[10px] text-ios-blue-light dark:text-ios-blue-dark font-semibold">Voter</span>
            </button>
          );
        })}
      </div>

      {totalVotes > 0 && (
        <p className="text-[10px] text-ios-label-secondaryLight/60 font-bold text-right">
          Total : {totalVotes} {totalVotes > 1 ? 'votes' : 'vote'}
        </p>
      )}
    </div>
  );
};
