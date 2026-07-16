use crate::llm::provider::{ChatCompletionRequest, ChatMessage};
use crate::models::{Goal, Task};
use chrono::{Datelike, Local, NaiveDate};
use std::collections::{HashMap, HashSet};

pub struct BriefingAgent;

impl BriefingAgent {
    /// Build a prompt that asks the LLM to generate a daily briefing from the user's tasks and goals.
    /// For completed tasks, only those finished yesterday (or today) are included.
    pub fn build_prompt(tasks: &[Task], goals: &[Goal]) -> ChatCompletionRequest {
        let now = Local::now();
        let today = now.format("%Y-%m-%d").to_string();
        let yesterday = (now - chrono::Duration::days(1)).format("%Y-%m-%d").to_string();
        let weekday = now.format("%A").to_string();
        let is_friday = now.weekday() == chrono::Weekday::Fri;
        let is_monday = now.weekday() == chrono::Weekday::Mon;

        // For Friday: compute the Monday of this week as the week boundary
        let week_start = if is_friday {
            let monday = now - chrono::Duration::days(now.weekday().num_days_from_monday() as i64);
            Some(monday.format("%Y-%m-%d").to_string())
        } else {
            None
        };

        // For Monday: compute last week's Monday and Sunday
        let last_week_start = if is_monday {
            Some((now - chrono::Duration::days(7)).format("%Y-%m-%d").to_string())
        } else {
            None
        };
        let last_week_end = if is_monday {
            Some((now - chrono::Duration::days(1)).format("%Y-%m-%d").to_string())
        } else {
            None
        };

        let goal_names: HashMap<&str, &str> = goals
            .iter()
            .map(|goal| (goal.id.as_str(), goal.title.as_str()))
            .collect();

        // Build a compact task summary:
        // - Friday: include all tasks from this week (Monday onward)
        // - Other days: include all non-completed tasks + recently completed tasks
        let mut task_list = String::new();
        for t in tasks {
            if t.status == "done" {
                if let Some(ref mon) = week_start {
                    // Friday mode: include tasks completed since Monday
                    let is_this_week = t.completed_at.as_ref().map_or(false, |ca| {
                        NaiveDate::parse_from_str(ca.trim(), "%Y-%m-%d")
                            .map(|d| d.format("%Y-%m-%d").to_string() >= *mon)
                            .unwrap_or_else(|_| {
                                ca.trim().get(..10).map_or(false, |date_part| date_part >= mon.as_str())
                            })
                    });
                    if !is_this_week {
                        continue;
                    }
                } else if let Some(ref lw_start) = last_week_start {
                    // Monday mode: include tasks completed last week
                    let lw_end = last_week_end.as_ref().unwrap();
                    let is_last_week = t.completed_at.as_ref().map_or(false, |ca| {
                        ca.trim().get(..10).map_or(false, |date_part| {
                            date_part >= lw_start.as_str() && date_part <= lw_end.as_str()
                        })
                    });
                    if !is_last_week {
                        continue;
                    }
                } else {
                    let is_recent = t.completed_at.as_ref().map_or(false, |ca| {
                        NaiveDate::parse_from_str(ca.trim(), "%Y-%m-%d")
                            .map(|d| d.format("%Y-%m-%d").to_string() == yesterday || d.format("%Y-%m-%d").to_string() == today)
                            .unwrap_or_else(|_| {
                                ca.trim().get(..10).map_or(false, |date_part| {
                                    date_part == yesterday || date_part == today
                                })
                            })
                    });
                    if !is_recent {
                        continue;
                    }
                }
            }
            let deadline_str = t
                .deadline
                .as_ref()
                .map(|d| format!("deadline: {d}"))
                .unwrap_or_else(|| "no deadline".to_string());
            let cat = t.category.as_deref().unwrap_or("none");
            let goal_title = t
                .goal_id
                .as_deref()
                .and_then(|goal_id| goal_names.get(goal_id).copied())
                .unwrap_or("none");
            let completed_info = t.completed_at.as_ref().map(|ca| format!(" | completed:{ca}")).unwrap_or_default();

            // Inject description and progress log for tasks that have them
            let mut detail_parts: Vec<String> = Vec::new();
            if !t.description.is_empty() {
                detail_parts.push(format!("desc: {}", t.description));
            }
            if !t.progress_log.is_empty() {
                let progress_str = t
                    .progress_log
                    .iter()
                    .map(|p| format!("[{}] {}", p.recorded_at, p.content))
                    .collect::<Vec<_>>()
                    .join("; ");
                detail_parts.push(format!("progress: {}", progress_str));
            }
            let detail_info = if detail_parts.is_empty() {
                String::new()
            } else {
                format!(" | {}", detail_parts.join(" | "))
            };

            task_list.push_str(&format!(
                "- [{status}] \"{title}\" | priority:{prio}/10 | {deadline} | category:{cat} | goal:{goal_title}{completed_info}{detail_info}\n",
                status = t.status,
                title = t.title,
                prio = t.priority,
                deadline = deadline_str,
                cat = cat,
                goal_title = goal_title,
                completed_info = completed_info,
                detail_info = detail_info,
            ));
        }

        let mut goal_list = String::new();
        for goal in goals.iter().filter(|goal| goal.status != "abandoned") {
            let goal_tasks: Vec<&Task> = tasks
                .iter()
                .filter(|task| task.goal_id.as_deref() == Some(goal.id.as_str()))
                .collect();
            let parent_ids: HashSet<&str> = goal_tasks
                .iter()
                .filter_map(|task| task.parent_id.as_deref())
                .collect();
            let leaves: Vec<&Task> = goal_tasks
                .iter()
                .copied()
                .filter(|task| !parent_ids.contains(task.id.as_str()))
                .collect();
            let total_weight: f64 = leaves.iter().map(|task| task.weight.max(0.1)).sum();
            let completed_weight: f64 = leaves
                .iter()
                .filter(|task| task.status == "done")
                .map(|task| task.weight.max(0.1))
                .sum();
            let progress = if total_weight > 0.0 {
                ((completed_weight / total_weight) * 100.0).round() as i32
            } else {
                0
            };
            let completed_count = leaves.iter().filter(|task| task.status == "done").count();
            let overdue_count = leaves
                .iter()
                .filter(|task| {
                    if task.status == "done" {
                        return false;
                    }
                    task.planned_end_at
                        .as_deref()
                        .or(task.deadline.as_deref())
                        .and_then(|date| date.get(..10))
                        .is_some_and(|date| date < today.as_str())
                })
                .count();
            let unfinished_titles = leaves
                .iter()
                .filter(|task| task.status != "done")
                .take(5)
                .map(|task| task.title.as_str())
                .collect::<Vec<_>>()
                .join("、");

            goal_list.push_str(&format!(
                "- \"{title}\" | status:{status} | progress:{progress}% | period:{start} -> {target} | completed:{completed}/{total} | overdue:{overdue}\n  description:{description}\n  success criteria:{criteria}\n  next tasks:{unfinished}\n",
                title = goal.title,
                status = goal.status,
                progress = progress,
                start = goal.start_date.as_deref().unwrap_or("unset"),
                target = goal.target_date.as_deref().unwrap_or("unset"),
                completed = completed_count,
                total = leaves.len(),
                overdue = overdue_count,
                description = if goal.description.is_empty() { "none" } else { &goal.description },
                criteria = if goal.success_criteria.is_empty() { "none" } else { &goal.success_criteria },
                unfinished = if unfinished_titles.is_empty() { "none" } else { &unfinished_titles },
            ));
        }
        if goal_list.is_empty() {
            goal_list.push_str("- 暂无目标计划\n");
        }

        let monday_section = if is_monday {
            r#"
📅 **上周回顾**：今天是周一，请对上周所有任务进行回顾：
   - 上周已完成：总结上周完成的成果
   - 上周进行中：梳理仍在推进的任务
   - 上周待办：上周未完成的任务
   - 给出本周建议和重点
"#
        } else {
            ""
        };

        let friday_section = if is_friday {
            r#"
🌟 **本周总结**：今天是周五，请对本周所有任务进行回顾：
   - 本周已完成：总结成果，为完成的任务喝彩
   - 本周进行中：梳理仍在推进的任务
   - 本周待办：尚未开始的任务
   - 给出本周整体评价和下周建议
"#
        } else {
            ""
        };

        let system_prompt = format!(
            r#"你是一位贴心的每日简报助手。请根据用户的任务，生成一份简洁、有激励作用的每日简报。

今天: {today} ({weekday})
昨天: {yesterday}
{friday_note}
{monday_note}
简报内容应包含：
1. 一句符合当前时段（早晨/下午/晚上）的问候
2. **昨日完成**：为昨天完成的任务喝彩（status "done"）
3. **进行中**：正在推进的任务（status "in_progress"）
4. **逾期或紧急**：已过截止日期或优先级 8+ 的任务
5. **今日建议**：推荐 2-3 个今天应重点处理的任务，按优先级排序
6. **目标计划分析**：必须使用独立的二级标题 `## 目标计划分析`。逐个分析目标的当前进度、期限风险、计划偏差和下一步行动，不要混入“进行中”或“今日建议”章节；若暂无目标计划，也保留该标题并简短说明
{monday_section}{friday_section}7. 一句简短的鼓励性结语

{task_note}

语气要温暖、简洁、自然。使用 Markdown 格式排版，可使用二级/三级标题（## / ###）、无序列表（- ）、有序列表、加粗（**文字**）等语法让简报层次清晰、易于阅读。

返回 JSON 对象：{{"briefing": "完整的简报文本"}}"#,
            friday_note = if is_friday { format!("本周一: {}", week_start.as_ref().unwrap()) } else { String::new() },
            friday_section = friday_section,
            monday_section = monday_section,
            monday_note = if is_monday { format!("上周一({})至上周日({})", last_week_start.as_ref().unwrap(), last_week_end.as_ref().unwrap()) } else { String::new() },
            task_note = if is_friday { "注意：今天是周五，任务列表包含本周一以来的所有任务，请进行全面周报分析。" } else if is_monday { "注意：今天是周一，任务列表包含上周一至上周日完成的任务，请进行上周回顾分析。" } else { "注意：任务列表仅包含昨天和今天完成的任务，昨天之前完成的已排除。" },
        );

        let user_message = format!(
            "以下是我的任务：\n\n{task_list}\n以下是我的目标计划：\n\n{goal_list}\n请生成我的每日简报，并将目标计划分析单列为独立章节。"
        );

        ChatCompletionRequest {
            model: String::new(),
            messages: vec![
                ChatMessage {
                    role: "system".into(),
                    content: system_prompt,
                },
                ChatMessage {
                    role: "user".into(),
                    content: user_message,
                },
            ],
            temperature: Some(0.7),
            max_tokens: Some(1024),
            top_p: None,
            top_k: None,
            response_format: Some(serde_json::json!({"type": "json_object"})),
            stream: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::BriefingAgent;

    #[test]
    fn prompt_requires_a_separate_goal_analysis_section() {
        let request = BriefingAgent::build_prompt(&[], &[]);

        assert!(request.messages[0]
            .content
            .contains("`## 目标计划分析`"));
        assert!(request.messages[1].content.contains("暂无目标计划"));
    }
}
