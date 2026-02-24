// Smart Parameter Grouping & Tagging System
// Manages logical groupings and tags for trading parameters

import { v4 as uuidv4 } from 'uuid';
import { MTConfig } from '@/types/mt-config';
import {
  TaggingSystemState,
  ParameterTag,
  ParameterGroup,
  GroupingRule,
  GroupCriteria,
  GroupedParameter
} from './types';

const STORAGE_KEY = 'daavfx_parameter_grouping';

export class ParameterGroupingManager {
  private state: TaggingSystemState;
  private onChangeCallbacks: Array<(state: TaggingSystemState) => void> = [];

  constructor() {
    const saved = this.loadFromStorage();
    this.state = saved || {
      tags: [],
      groups: [],
      rules: [],
      parameterTags: {},
      parameterGroups: {},
    };
  }

  // Subscribe to state changes
  subscribe(callback: (state: TaggingSystemState) => void): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      const index = this.onChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.onChangeCallbacks.splice(index, 1);
      }
    };
  }

  private notifyChange(): void {
    this.saveToStorage();
    this.onChangeCallbacks.forEach(callback => callback(this.getState()));
  }

  getState(): TaggingSystemState {
    return { ...this.state };
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      return;
    }
  }

  private loadFromStorage(): TaggingSystemState | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }

  // Create a new tag
  createTag(name: string, color: string, description: string, createdBy: string = 'system'): ParameterTag {
    const existingTag = this.state.tags.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existingTag) {
      throw new Error(`Tag '${name}' already exists`);
    }

    const newTag: ParameterTag = {
      id: uuidv4(),
      name,
      color,
      description,
      createdAt: Date.now(),
      createdBy,
    };

    this.state.tags.push(newTag);
    this.notifyChange();
    return newTag;
  }

  // Update an existing tag
  updateTag(tagId: string, updates: Partial<ParameterTag>): ParameterTag | null {
    const index = this.state.tags.findIndex(t => t.id === tagId);
    if (index === -1) return null;

    this.state.tags[index] = { ...this.state.tags[index], ...updates };
    this.notifyChange();
    return this.state.tags[index];
  }

  // Delete a tag
  deleteTag(tagId: string): boolean {
    const initialLength = this.state.tags.length;
    this.state.tags = this.state.tags.filter(t => t.id !== tagId);

    if (this.state.tags.length === initialLength) {
      return false; // Not found
    }

    // Remove tag from all parameters
    Object.keys(this.state.parameterTags).forEach(paramKey => {
      this.state.parameterTags[paramKey] = this.state.parameterTags[paramKey].filter(id => id !== tagId);
    });

    this.notifyChange();
    return true;
  }

  // Create a new parameter group
  createGroup(
    name: string,
    description: string,
    type: ParameterGroup['type'],
    criteria: GroupCriteria,
    tags: string[] = [],
    createdBy: string = 'system'
  ): ParameterGroup {
    const existingGroup = this.state.groups.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (existingGroup) {
      throw new Error(`Group '${name}' already exists`);
    }

    const newGroup: ParameterGroup = {
      id: uuidv4(),
      name,
      description,
      type,
      criteria,
      parameters: [],
      tags,
      createdAt: Date.now(),
      createdBy,
      isActive: true,
    };

    this.state.groups.push(newGroup);
    this.notifyChange();
    return newGroup;
  }

  // Update an existing group
  updateGroup(groupId: string, updates: Partial<ParameterGroup>): ParameterGroup | null {
    const index = this.state.groups.findIndex(g => g.id === groupId);
    if (index === -1) return null;

    this.state.groups[index] = { ...this.state.groups[index], ...updates };

    this.notifyChange();
    return this.state.groups[index];
  }

  // Delete a group
  deleteGroup(groupId: string): boolean {
    const initialLength = this.state.groups.length;
    this.state.groups = this.state.groups.filter(g => g.id !== groupId);

    if (this.state.groups.length === initialLength) {
      return false; // Not found
    }

    // Remove group from all parameters
    Object.keys(this.state.parameterGroups).forEach(paramKey => {
      this.state.parameterGroups[paramKey] = this.state.parameterGroups[paramKey].filter(id => id !== groupId);
    });

    this.notifyChange();
    return true;
  }

  // Create a new grouping rule
  createRule(
    name: string,
    description: string,
    criteria: GroupCriteria,
    autoApply: boolean = false,
    createdBy: string = 'system'
  ): GroupingRule {
    const existingRule = this.state.rules.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (existingRule) {
      throw new Error(`Rule '${name}' already exists`);
    }

    const newRule: GroupingRule = {
      id: uuidv4(),
      name,
      description,
      criteria,
      autoApply,
      createdAt: Date.now(),
      createdBy,
    };

    this.state.rules.push(newRule);
    this.notifyChange();
    return newRule;
  }

  // Apply a rule to the configuration
  applyRuleToConfig(ruleId: string, config: MTConfig): GroupedParameter[] {
    const rule = this.state.rules.find(r => r.id === ruleId);
    if (!rule) return [];

    return this.findParametersByCriteria(config, rule.criteria);
  }

  // Apply all auto-apply rules to the configuration
  applyAutoRulesToConfig(config: MTConfig): void {
    const autoRules = this.state.rules.filter(r => r.autoApply);
    for (const rule of autoRules) {
      const params = this.findParametersByCriteria(config, rule.criteria);

      // Add parameters to corresponding groups
      for (const param of params) {
        const paramKey = this.getParameterKey(param);
        if (!this.state.parameterGroups[paramKey]) {
          this.state.parameterGroups[paramKey] = [];
        }

        // Add to groups that match this rule's criteria
        const matchingGroups = this.state.groups.filter(
          g => this.matchesCriteria(param, g.criteria)
        );

        for (const group of matchingGroups) {
          if (!this.state.parameterGroups[paramKey].includes(group.id)) {
            this.state.parameterGroups[paramKey].push(group.id);
          }
        }
      }
    }

    this.notifyChange();
  }

  // Find parameters by criteria
  findParametersByCriteria(config: MTConfig, criteria: GroupCriteria): GroupedParameter[] {
    const uniqueResults: GroupedParameter[] = [];
    const seen = new Set<string>();

    for (const engine of config.engines) {
      for (const group of engine.groups) {
        for (const logic of group.logics) {
          for (const field of Object.keys(logic)) {
            if (field === 'logic_name') continue;
            const param: GroupedParameter = {
              engineId: engine.engine_id,
              groupId: group.group_number,
              logicName: logic.logic_name,
              fieldName: field,
              currentValue: (logic as any)[field],
              tags: [],
            };

            if (!this.matchesCriteria(param, criteria)) continue;
            const key = this.getParameterKey(param);
            if (seen.has(key)) continue;
            seen.add(key);

            const paramTags = this.state.parameterTags[key] || [];
            uniqueResults.push({ ...param, tags: paramTags });
          }
        }
      }
    }

    return uniqueResults;
  }

  // Check if a parameter matches criteria
  private matchesCriteria(param: GroupedParameter, criteria: GroupCriteria): boolean {
    if (criteria.engineIds) {
      const matchesEngine = criteria.engineIds.some((id) => id === param.engineId || id === `Engine ${param.engineId}`);
      if (!matchesEngine) return false;
    }

    if (criteria.groupNumbers && !criteria.groupNumbers.includes(param.groupId)) {
      return false;
    }

    if (criteria.logicNames && !criteria.logicNames.includes(param.logicName)) {
      return false;
    }

    if (criteria.fieldPatterns) {
      let matchesPattern = false;
      for (const pattern of criteria.fieldPatterns) {
        try {
          const regex = new RegExp(pattern);
          if (regex.test(param.fieldName)) {
            matchesPattern = true;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!matchesPattern) return false;
    }

    if (criteria.valueRanges) {
      for (const range of criteria.valueRanges) {
        if (range.field !== param.fieldName) continue;
        const value = typeof param.currentValue === 'number' ? param.currentValue : Number(param.currentValue);
        if (Number.isNaN(value)) return false;
        if (range.min !== undefined && value < range.min) return false;
        if (range.max !== undefined && value > range.max) return false;
      }
    }

    return true;
  }

  // Get the key for a parameter (for indexing purposes)
  private getParameterKey(param: GroupedParameter): string {
    return `${param.engineId}_${param.groupId}_${param.logicName}_${param.fieldName}`;
  }

  // Add tags to a parameter
  addTagsToParameter(paramKey: string, tagIds: string[]): void {
    if (!this.state.parameterTags[paramKey]) {
      this.state.parameterTags[paramKey] = [];
    }

    for (const tagId of tagIds) {
      if (!this.state.parameterTags[paramKey].includes(tagId)) {
        this.state.parameterTags[paramKey].push(tagId);
      }
    }

    this.notifyChange();
  }

  // Remove tags from a parameter
  removeTagsFromParameter(paramKey: string, tagIds: string[]): void {
    if (!this.state.parameterTags[paramKey]) return;

    this.state.parameterTags[paramKey] = this.state.parameterTags[paramKey].filter(
      id => !tagIds.includes(id)
    );

    this.notifyChange();
  }

  // Add a parameter to a group
  addParameterToGroup(paramKey: string, groupId: string): void {
    if (!this.state.parameterGroups[paramKey]) {
      this.state.parameterGroups[paramKey] = [];
    }

    if (!this.state.parameterGroups[paramKey].includes(groupId)) {
      this.state.parameterGroups[paramKey].push(groupId);
    }

    this.notifyChange();
  }

  // Remove a parameter from a group
  removeParameterFromGroup(paramKey: string, groupId: string): void {
    if (!this.state.parameterGroups[paramKey]) return;

    this.state.parameterGroups[paramKey] = this.state.parameterGroups[paramKey].filter(
      id => id !== groupId
    );

    this.notifyChange();
  }

  // Get all tags for a parameter
  getParameterTags(paramKey: string): ParameterTag[] {
    const tagIds = this.state.parameterTags[paramKey] || [];
    return this.state.tags.filter(tag => tagIds.includes(tag.id));
  }

  // Get all groups for a parameter
  getParameterGroups(paramKey: string): ParameterGroup[] {
    const groupIds = this.state.parameterGroups[paramKey] || [];
    return this.state.groups.filter(group => groupIds.includes(group.id));
  }

  // Get parameters by tag
  getParametersByTag(tagId: string): string[] {
    return Object.entries(this.state.parameterTags)
      .filter(([_, tagIds]) => tagIds.includes(tagId))
      .map(([paramKey, _]) => paramKey);
  }

  // Get parameters by group
  getParametersByGroup(groupId: string): string[] {
    return Object.entries(this.state.parameterGroups)
      .filter(([_, groupIds]) => groupIds.includes(groupId))
      .map(([paramKey, _]) => paramKey);
  }

  // Reset the entire system
  reset(): void {
    this.state = {
      tags: [],
      groups: [],
      rules: [],
      parameterTags: {},
      parameterGroups: {},
    };
    this.notifyChange();
  }
}

// Singleton instance
let parameterGroupingManager: ParameterGroupingManager | null = null;

export function getParameterGroupingManager(): ParameterGroupingManager {
  if (!parameterGroupingManager) {
    parameterGroupingManager = new ParameterGroupingManager();
  }
  return parameterGroupingManager;
}
