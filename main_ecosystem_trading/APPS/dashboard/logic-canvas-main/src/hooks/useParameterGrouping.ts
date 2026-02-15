// React hook for parameter grouping and tagging system

import { useState, useEffect } from 'react';
import { MTConfig } from '@/types/mt-config';
import { getParameterGroupingManager, ParameterGroupingManager } from '@/lib/parameter-grouping/manager';
import {
  TaggingSystemState,
  ParameterTag,
  ParameterGroup,
  GroupingRule,
  GroupCriteria,
  GroupedParameter
} from './types';

export function useParameterGrouping(initialConfig?: MTConfig) {
  const [pgManager] = useState<ParameterGroupingManager>(() => getParameterGroupingManager());
  const [state, setState] = useState<TaggingSystemState>(pgManager.getState());

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = pgManager.subscribe(setState);
    return unsubscribe;
  }, [pgManager]);

  const createTag = (name: string, color: string, description: string, createdBy: string = 'user') => {
    return pgManager.createTag(name, color, description, createdBy);
  };

  const updateTag = (tagId: string, updates: Partial<ParameterTag>) => {
    return pgManager.updateTag(tagId, updates);
  };

  const deleteTag = (tagId: string) => {
    return pgManager.deleteTag(tagId);
  };

  const createGroup = (
    name: string,
    description: string,
    type: ParameterGroup['type'],
    criteria: GroupCriteria,
    tags: string[] = [],
    createdBy: string = 'user'
  ) => {
    return pgManager.createGroup(name, description, type, criteria, tags, createdBy);
  };

  const updateGroup = (groupId: string, updates: Partial<ParameterGroup>) => {
    return pgManager.updateGroup(groupId, updates);
  };

  const deleteGroup = (groupId: string) => {
    return pgManager.deleteGroup(groupId);
  };

  const createRule = (
    name: string,
    description: string,
    criteria: GroupCriteria,
    autoApply: boolean = false,
    createdBy: string = 'user'
  ) => {
    return pgManager.createRule(name, description, criteria, autoApply, createdBy);
  };

  const applyAutoRulesToConfig = (config: MTConfig) => {
    pgManager.applyAutoRulesToConfig(config);
  };

  const findParametersByCriteria = (config: MTConfig, criteria: GroupCriteria) => {
    return pgManager.findParametersByCriteria(config, criteria);
  };

  const addTagsToParameter = (paramKey: string, tagIds: string[]) => {
    pgManager.addTagsToParameter(paramKey, tagIds);
  };

  const removeTagsFromParameter = (paramKey: string, tagIds: string[]) => {
    pgManager.removeTagsFromParameter(paramKey, tagIds);
  };

  const addParameterToGroup = (paramKey: string, groupId: string) => {
    pgManager.addParameterToGroup(paramKey, groupId);
  };

  const removeParameterFromGroup = (paramKey: string, groupId: string) => {
    pgManager.removeParameterFromGroup(paramKey, groupId);
  };

  const getParameterTags = (paramKey: string) => {
    return pgManager.getParameterTags(paramKey);
  };

  const getParameterGroups = (paramKey: string) => {
    return pgManager.getParameterGroups(paramKey);
  };

  const getParametersByTag = (tagId: string) => {
    return pgManager.getParametersByTag(tagId);
  };

  const getParametersByGroup = (groupId: string) => {
    return pgManager.getParametersByGroup(groupId);
  };

  return {
    // State
    state,

    // Tag operations
    createTag,
    updateTag,
    deleteTag,

    // Group operations
    createGroup,
    updateGroup,
    deleteGroup,

    // Rule operations
    createRule,
    applyAutoRulesToConfig,

    // Parameter operations
    findParametersByCriteria,
    addTagsToParameter,
    removeTagsFromParameter,
    addParameterToGroup,
    removeParameterFromGroup,

    // Queries
    getParameterTags,
    getParameterGroups,
    getParametersByTag,
    getParametersByGroup,
  };
}
