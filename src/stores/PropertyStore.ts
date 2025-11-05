import { makeAutoObservable, runInAction } from 'mobx';
import { PropertySearchService } from '../services/awsClient';
import type { SearchFilters, UnclaimedProperty } from '../types/Property';
import { convertDatabaseProperty } from '../utils/propertyConverter';

export class PropertyStore {
  // Observable state
  properties: UnclaimedProperty[] = [];
  searchResults: UnclaimedProperty[] = [];
  searchFilters: SearchFilters = {};
  isLoading = false;
  error: string | null = null;
  lastUpdateDate: Date | null = null;
  searchQuery = '';
  lastSearchedQuery = ''; // Track the last query that was actually searched
  _totalPropertyCount = 0;
  
  constructor() {
    makeAutoObservable(this);
    this.loadTotalCount();
  }


  private async loadTotalCount() {
    try {
      const count = await PropertySearchService.getTotalPropertyCount();
      runInAction(() => {
        this._totalPropertyCount = count;
      });
    } catch (error) {
      console.error('Error loading total count:', error);
    }
  }

  // Actions
  setSearchQuery = (query: string) => {
    this.searchQuery = query;
    // Remove automatic search - now only searches when explicitly triggered
  };

  setSearchFilters = (filters: Partial<SearchFilters>) => {
    this.searchFilters = { ...this.searchFilters, ...filters };
    // Remove automatic search on filter change
  };

  clearSearch = () => {
    this.searchResults = [];
    this.searchQuery = '';
    this.lastSearchedQuery = '';
    this.error = null;
  };

  performSearch = async () => {
    const trimmedQuery = this.searchQuery.trim();
    
    if (!trimmedQuery) {
      this.clearSearch();
      return;
    }

    // Prevent searching with the same text string
    if (trimmedQuery === this.lastSearchedQuery) {
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.lastSearchedQuery = trimmedQuery;

    try {
      const results = await PropertySearchService.searchProperties({
        searchName: trimmedQuery,
        minAmount: this.searchFilters.minAmount,
        maxAmount: this.searchFilters.maxAmount,
        searchCity: this.searchFilters.city,
        searchPropertyType: this.searchFilters.propertyType,
        limit: 1000
      });

      const convertedResults = results.map(result => convertDatabaseProperty(result));
      
      runInAction(() => {
        this.searchResults = convertedResults;
        this.isLoading = false;
        this.error = null;
      });

    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'An error occurred while searching. Please try again.';
        this.isLoading = false;
      });
    }
  };

  loadPropertyData = async (data: UnclaimedProperty[]) => {
    runInAction(() => {
      this.properties = data;
      this.lastUpdateDate = new Date();
    });
  };

  // Computed values
  get searchResultsCount() {
    return this.searchResults.length;
  }

  get totalPropertyCount() {
    return this._totalPropertyCount;
  }

  get hasResults() {
    return this.searchResults.length > 0;
  }

  get hasSearched() {
    return this.lastSearchedQuery.length > 0;
  }
} 