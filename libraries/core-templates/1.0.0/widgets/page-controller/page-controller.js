define(["app"], function(app) {

	app.ng.directive("avNavigator", ["$rootScope", "$timeout", "$q", "Form", "Scroll", "Util", "Rules", "Resource", "Insights", "Widget", "Translation",
		function($rootScope, $timeout, $q, Form, Scroll, Util, Rules, Resource, Insights, Widget, Translation) {
			return function($scope, $element) {
				if (Resource.design) Form.onReload(load);
				else load();

				function load() {
					Form.getItem($scope, $element).then(function(item) {
						$scope.item = item;

						if(Resource.design && Form.dialog) return;

                        // if for example the user goes to a modal page and then back to form, preserve state.
						if (Form.$Pages) $scope.Pages = Form.$Pages;
						else Form.$Pages = item.$Pages = $scope.Pages = new Pages($scope, item);

						$scope.blurAll = function() {
							$element.find("input, select, textarea").blur();	// Force angular binding of any auto-filled fields
						};

						$scope.showSpinner = function(isVisible) {
							$element[!isVisible ? "addClass" : "removeClass"]("av-page-loaded");
						};

						/*
                        Rules["click_" + item.id] = function(data, item, evt) {
                            if(Form.validation && Form.validation.errors.length > 0 ) {
                                data.showSmallErrorField = true;
                            }
                        };
                        Rules["dc_" + item.id] = function(data, item, evt) {
                            return data.pageChangeAnimation;
                        };
                        Rules["pagechange_" + item.id] = function(data, item, evt) {
                            var pageFrom = Form.getItemFromPath(info.from);
                            var pageTo = Form.getItemFromPath(info.to);
                            var pageTransition = Form.getItemProperty("data.pageController_1","pageTransition");
                            if (pageTransition == "Fade"){
                                data.pageChangeAnimation = "transition-fade";
                            }
                            else if (pageTransition == "Slide"){
                                var navigateForwards = Form.getNavPages().indexOf(pageTo) > Form.getNavPages().indexOf(pageFrom);
                                data.pageChangeAnimation = navigateForwards ? "slide-Out-To-Left" : "slide-Out-To-Right";
                            }
                            var _scroll = $(window).scrollTop();
                            var dp = Form.getItemProperty("data.dockingController","dockPosition");
                            if (data.docked){
                                $(window).scrollTop(dp);
                                $("#" + pageFrom.id).css("top", "-" + (_scroll - dp) + "px");
                            }
                            $("#" + pageTo.id).css("top", "0");
                        };
                        */
					});
				}
			};

			function Pages($scope, item) {
				var self = this,
					functionBarItem = Form.getItemsOfType("nav-functions"),
					restartAtLastSavedPage = item.properties.restartAtLastSavedPage,
					dataBeforeChange;

				this.viewIndex = 0;

				this.isPageDisplayed = false;

				this.policy = {
					validate: item.properties.validationMode === "sequential",		// Must validate current page before moving forward
					restrict: item.properties.validationMode === "sequential" && Resource.generated,		// May only move forward by one page
					saveOnPageChange: item.properties.saveOnPageChange  // Form will perform background save on page change
				};

				this.index = 0;

				if (Resource.design) {
					$scope.$watch("item.properties.leftMenu", function(){ checkLeft(); if(self.isLeft) self.topStyle = {}; })
				} else {
                    checkLeft();

                    if (self.policy.saveOnPageChange) {
                        dataBeforeChange = JSON.parse(Util.jsonify(Form.data, ["SFMData"]));
                    }
                }

				function checkLeft() {
					self.isLeft = item.properties.leftMenu;
				}

				this.toggleMenu = function() {
					var $body = angular.element(document.getElementsByTagName("body"));

					self.uncollapsed = !self.uncollapsed;
					$body.toggleClass("av-menu-uncollapsed", self.uncollapsed);

					self.collapsing = true;
					$body.addClass("av-menu-collapsing");

					$timeout(function() {
						self.collapsing = false;
						$body.removeClass("av-menu-collapsing");
					}, 500);

					// Close menu if window size has changed
					if(self.uncollapsed) {
						$(window).on("resize.menu", Util.throttle(function(e){
							if($(this).width() > +Form.view.breakpoints[1]) self.toggleMenu();
						}, 50));
					} else {
						$(window).off("resize.menu");
					}
				};

				/**
				 * Choose a navigation item.
				 * @param top	Top level choice
				 * @param sub	Level 2 choice (if any)
				 * @param skipSelect	Source is the design selection of an inner item - bypass page selection
				 * @param skipRules		Source is initialisation - bypass page change rules and analytics
                 * @param skipValidation Skips validation if set to true
				 * @param skipScrollFocus Skips the default scrolling and focus management
				 * @returns {*|Promise}
				 */
				this.choose = function(top, sub, skipSelect, skipRules, skipValidation, skipScrollFocus) {
					var newPage = sub || (top.$navPages ? top.$navPages.filter(pageVisible)[0] : top),
						nextPage,
						choosePromise = $q.defer(),
						choiceIndex = self.flatPages.indexOf(newPage),
						bypassValidation = 					// Don't run validation if:
							!self.policy.validate			// Validation policy turned off
							|| choiceIndex < self.index		// Navigating backwards
							|| !self.currentPage			// Page not set - during initialisation
							|| Resource.design;				// In design mode

					if (newPage.$navDisabled && !skipValidation && !$scope.Editor) return;		// Enforce page-by-page policy

					if (self.uncollapsed) {		// Mobile menu
						if (!sub && top.$navPages) {	// Selected group
							deselectGroups();
							top.$navSelected = true;
							return;
						} else self.toggleMenu();
					}

					if(skipValidation) {
						$timeout(10).then(proceed);
					} else {
//                      if(Resource.generated) $scope.blurAll();	// Assists in ensuring browser form auto-completion works properly
						$timeout(function() {
							self.validate(bypassValidation).then(function(validation) {
								if (!Form.validation.valid) {
									Form.gotoError(0);		// Show error block
								} else {	// Proceed
									proceed();
								}
							});
						}, 10);
					}
					return choosePromise.promise;

					function proceed() {
						var pageChangeRule = Rules["pagechange_" + item.id],
							pageLoadRule = Rules["pageload_" + newPage.id],
							pageScrollRule = Rules["pagescroll_"+newPage.id],
							scrollDelay = (item.properties.transitionDelay + 100) || 0,
							baseUrl = (Form.view.properties.gaTrackingId && Form.view.properties.gaBaseUrl) || "/",
							prevPage = self.currentPage,
							pageInfo;

						deselectGroups();
						self.flatPages.forEach(function(p) { p.$navSelected = false; });

						top.$navSelected = true;	// Mark current selection
						if (sub) sub.$navSelected = true;
						else if (top.$navPages) {
							newPage.$navSelected = true;
						}
						if (top.$navPages) setSubMenuWidth(top);
						self.index = choiceIndex;
						if (self.currentPage) {
							if (self.policy.saveOnPageChange && $scope.Resource.generated) {
                                var currentData = JSON.parse(Util.jsonify(Form.data, ["SFMData"]));
								if (!angular.equals(dataBeforeChange, currentData)) {
                                    Form.backgroundSave();
                                    dataBeforeChange = currentData;
                                }
							}
						}

						self.currentPage = newPage;
						self.currentPage.$navVisited = true;
						self.groups.forEach(function (pg) {
							pg.$navVisited = pg.$navPages.every(function (p) {
								return p.$navVisited;
							})
						});

						Form.completeSectionsOnSubmit.push(newPage);

						if (!self.currentPage.$isLast) {
							nextPage = getAdjacentPage(self.currentPage, true);
							if(!nextPage.$notEditable) nextPage.$navDisabled = false; 	// Enable next page
							if (nextPage.$navGroup && nextPage.$navGroup !== self.currentPage.$navGroup) {
								if(!nextPage.$notEditable) nextPage.$navGroup.$navDisabled = false;
							}

							if(self.policy.restrict) setDisabledPages();
						}

						if ($scope.Editor && !skipSelect) {	// Set the page as the selected item, can be bypassed for selection of page as parent
							$timeout(function() {
								$scope.Editor.selectItem(self.currentPage, true);
								$scope.Panels.showProperties();
							});
						}

						self.viewIndex = self.index;
						$scope.showSpinner(false);
						self.flatPages.forEach(function(page) { page.$viewTemplate = "nav-page_page-spinner" });
						self.currentPage.$viewTemplate = "nav-page_" + self.currentPage.id;
						self.isPageDisplayed = true;

						if (!Resource.design) {
							if (!/^\//.test(baseUrl)) baseUrl = "/" + baseUrl;
							if (!/\/$/.test(baseUrl)) baseUrl += "/";

							pageInfo = { from: prevPage && prevPage.id, to: self.currentPage.id };
							if (!skipRules && pageChangeRule && pageChangeRule($scope.data, item, pageInfo) === false) return;

							$timeout(scrollDelay).then(function () {
								if (!skipScrollFocus) {
									if (pageScrollRule) pageScrollRule($scope.data, item, pageInfo);
									else handleFocusMode(); // default scroll/focus functionality
								}
								
								if (pageLoadRule) pageLoadRule($scope.data, item, pageInfo);
							});

							if (Form.view.properties.gaTrackingId) {
								ga("set", {
									page: baseUrl + newPage.id,
									title: newPage.label
								});
								ga("send", "pageview");
							}

							if (pageVisible(newPage)) {
								Insights.navigation(newPage);
							}
						} else {	// In design
							localStorage.setItem("design-page-id-" + $scope.Resource.formDesignVersionId, newPage.id);	// Store selected page ID
						}

						choosePromise.resolve();
					}
				};

				/**
				 * Validate the current page
				 * @param bypass	Bypass actual validation, used if policy is not to validate each page
				 * @returns {*|Promise}
				 */
				self.validate = function(bypass) {
					var validationPromise;

					if (bypass) {
						validationPromise = $q.when( { valid: true, errors: [] } );
					} else {
						validationPromise = Form.validate(self.policy.validate ? self.currentPage : Form.view, null, "P");
					}

					return validationPromise.then(function(validation) {
						Form.validation = validation;
						Form.showMobileErrors = !Form.validation.valid;

						if (!bypass && validation.valid && pageVisible(self.currentPage)) {
							Insights.sectionCompletion(self.currentPage);
							Form.completeSectionsOnSubmit = Form.completeSectionsOnSubmit.filter(function(page) {
								return page.id !== self.currentPage.id;
							});
						}

						return validation;
					});
				};

				self.chooseFlat = function(page, skipValidation, skipScrollFocus) {
					if (!page) return;

					if (page.$navGroup) return self.choose(page.$navGroup, page, null, null, skipValidation, skipScrollFocus);
					else return self.choose(page, null, null, null, skipValidation, skipScrollFocus);
				};

				self.move = function(next) {
					return self.chooseFlat(getAdjacentPage(self.currentPage, next));
				};

				self.getVisiblePages = function () {
					return self.flatPages.filter(pageVisible);
				};

				self.pageLabel = function(page) {
					var dictItem = Translation.T[page.id] || Form.items[page.id];

					return dictItem
						? (dictItem.properties.menuText || dictItem.htmlLabel || dictItem.label)
						: "";
				};

				self.pageDescription = function (page) {
					var visiblePages = getPagesOnMenu(self.tree),
						stepNum = visiblePages.indexOf(page) + 1;

					return [
						"Step",
						stepNum,
						"of",
						visiblePages.length,
						getPageStatus() + " " + (!page.$navPages && "page" || "page group")
					].join(" ") + ",";

					function getPageStatus() {
						if (page.$navSelected) {
							return "current";
						} else if (stepNum > (self.index + 1)) {
							return "upcoming";
						} else if (page.$navVisited) {
							return "visited";
						}
						return "not visited"
					}
				};

				if (Resource.design) {
					var calculateWidthWatchArr = [],
						contentItems,
						pageItemToCreate = item.validChildren.filter(function(item){ return /page/.test(item); })[0] ||
							new Error("No page in nav-content valid children");

					if (item.rows[0].length === 0) $scope.Editor.createItem({type: pageItemToCreate, label: 'Page X', rows: [[]]}, item, 0, 0);

					$scope.$watchCollection(function() {		// Re-init on design changes
						contentItems = Util.children(item);

						return contentItems
							.concat(Util.children(contentItems)
								.filter(function(item) { return item.type === pageItemToCreate }));
					}, function(contentItems) {
						var savedPageId = localStorage.getItem("design-page-id-" + $scope.Resource.formDesignVersionId),
							savedPage;

						refreshPages();

						// De-register watchers
						if(calculateWidthWatchArr) calculateWidthWatchArr.forEach(function(deRegister){ deRegister(); }), calculateWidthWatchArr = [];
						// Recalculate widths in design mode
						self.flatPages.forEach(function(page, index) {
							if(typeof page.properties.offMenu !== "undefined") {
								calculateWidthWatchArr.push($scope.$watch(function(){
									return $scope.Pages.flatPages[index].properties.offMenu;
								}, function() {
									var page = self.flatPages[index];
									if (page.$navGroup) self.subStyle = self.isLeft ? {} : { width: (page.$navPages ? 100 / getPagesOnMenu(page.$navGroup.$navPages).length : 0) + "%" };
									else setMenuWidths();
								}));
							}
						});

						savedPage = self.flatPages.filter(function(p) {return p.id === savedPageId})[0];
						if (savedPage) {
							self.chooseFlat(savedPage);
						}
					});

					$scope.$watch("Editor.selectedItem", function(item) {	// Change to page containing selected item
						var page;
						if (item && self.flatPages && self.currentPage !== item) {
							do {
								if (self.flatPages.indexOf(item) >= 0) page = item;
								item = item.$$parent;
							} while (item && !page);
							if (page && page !== self.currentPage) {
								if (page.$navGroup) self.choose(page.$navGroup, page, true);
								else self.choose(page, null, true);
							}
						}
					});
				} else {	// Generated
					refreshPages();
					if(functionBarItem.length) makeFnList();
					watchPageRules();
				}

				function refreshPages() {
					self.tree = [];
					self.groups = [];
					self.flatPages = [];

					item.rows.forEach(function(row) {
						row.forEach(function(topItem) {
							var pos = self.tree.push(topItem);

							topItem.$navVisible = true;

							if (self.policy.restrict && pos > 2) topItem.$navDisabled = true;

							if (topItem.isNavGroup) {		// Group
								topItem.$navPages = [];
								var groupPos = self.groups.push(topItem);

								topItem.rows.forEach(function(row) {
									row.forEach(function(subItem) {
										subItem.$navGroup = topItem;
										subItem.$navVisible = true;

										if (self.policy.restrict && groupPos > 2) subItem.$navDisabled = true;

										topItem.$navPages.push(subItem);
										self.flatPages.push(subItem);
									});
								})
							} else {	// Page
								self.flatPages.push(topItem);
							}
						});
					});

					if(!self.flatPages[0].$notEditable) self.flatPages[0].$navDisabled = false;
					self.visiblePageCount = self.flatPages.length;

					setMenuWidths();
					setFirstAndLast(self.flatPages.filter(pageVisible));
					self.flatPages.forEach(function(page) { page.$viewTemplate = "nav-page_page-spinner" });

					if (self.flatPages.indexOf(self.currentPage) < 0) self.pageTemplate = self.currentPage = null;	// E.g. When selected page was deleted

					if (!self.currentPage) {
						var startingIndex = 0;

						if (Resource.generated && Form.getRevisionNumber() > 0 && restartAtLastSavedPage) {
							startingIndex = +(Form.getSystemData("LastSavedPageIndex") || 0);
						}

						var startPage = self.flatPages[startingIndex],
							top = startPage.$navGroup || startPage;

						self.choose(top, startPage, true, true, true).then(function () {
                            if (restartAtLastSavedPage && startingIndex >  0) setDisabledPages(); // refresh disabled pages
                        })
					}
				}

				function deselectGroups() {
					self.tree
						.filter(function(p) { return p.isNavGroup; })
						.forEach(function(g) { g.$navSelected = false });
				}

				// Make a list of items in the function bar to use in the mobile menu
				function makeFnList() {
					var fnButtons = Util.children(functionBarItem);

					self.fnList = fnButtons.map(function(fnButton) {
						return {
							icon: fnButton.properties.icon,
							label: fnButton.label,
							click: function() {
								var rule = Rules["click_" + fnButton.id];

								if (rule) rule($scope.data, fnButton);
								if (!self.isLeft) self.toggleMenu();
							}
						}
					});
				}

				function watchPageRules() {
					self.flatPages.concat(self.groups).forEach(function(navItem) {
						var visibilityRule = Rules["sh_" + navItem.id],
							editableRule = Rules["us_" + navItem.id];

						if (visibilityRule) {
							$rootScope.$watch(function() {
								return visibilityRule($scope.data, navItem);
							}, function(visible) {
								navItem.$navVisible = visible;
								var visiblePages = self.flatPages.filter(pageVisible);
								$timeout(15).then(function () {
									if(!visible && self.flatPages.indexOf(navItem) === self.index) {
										self.move(true);
									}
								});
								if(self.policy.restrict) setDisabledPages(visiblePages);
								setMenuWidths();
								if (navItem.$navGroup) setSubMenuWidth(navItem.$navGroup);
								setFirstAndLast(visiblePages);
								if(!visible && navItem.clearHidden === "immediate") {
									clearPageData(navItem);
								}
							});
						}

						if (editableRule) {
							$rootScope.$watch(function() {
								return editableRule($scope.data, navItem);
							}, function(editable) {
								navItem.$notEditable = navItem.$navDisabled = !editable;
							});
						}
					});
				}

				function setFirstAndLast(visiblePages) {
					self.flatPages.forEach(function(p) { p.$isFirst = p.$isLast = false; });
					visiblePages[0].$isFirst = true;
					visiblePages[visiblePages.length - 1].$isLast = true;
					self.visiblePageCount = visiblePages.length;
				}

                // Replaces avClear for pages and page groups
				function clearPageData(navItem) {
					Util.sendAll(navItem, function (child) {
						if ($scope.data.hasOwnProperty(child.id) && child.clearHidden !== "no"
							&& child.clearHidden !== "submit") {
							$scope.data[child.id] = child.repeatingData ? [] : "";
						}
					});
				}

				function setDisabledPages(visiblePages) {
					if(!self.currentPage) return;

					if(!visiblePages) visiblePages = self.flatPages.filter(pageVisible);

					var currentPageIndex = visiblePages.indexOf(self.currentPage);

					if(currentPageIndex === -1) return;

					visiblePages.forEach(function (p) {
						if(visiblePages.indexOf(p) > (currentPageIndex + 1) ||  (p.$navGroup && checkNavGroup(p))) {
							if(p.$navGroup && visiblePages[currentPageIndex + 1].$navGroup !== p.$navGroup) {
								p.$navGroup.$navDisabled = true;
							}
							p.$navDisabled = true;
						} else p.$navDisabled = false;
					});

					function checkNavGroup(p) {
						var navGroupPages = p.$navGroup.$navPages.filter(pageVisible),
							index = navGroupPages.indexOf(self.currentPage);
						if(index === -1) return false;
						return navGroupPages.indexOf(p) > index + 1;
					}
				}

				function pageVisible(p) {
					return p.$navVisible && (!p.$navGroup || p.$navGroup.$navVisible);
				}

				function getAdjacentPage(page, next) {
					var index = self.flatPages.indexOf(page),
						nextPage = {};

					while (nextPage && !pageVisible(nextPage)) {
						index = index + (next ? 1 : -1);
						nextPage = self.flatPages[index];
					}

					return nextPage;
				}

				function getPagesOnMenu(pages) {
					return pages.filter(function(page){ return page.$navVisible && !page.properties.offMenu;});
				}

				function setMenuWidths() {
					var topItemCount = self.tree.filter(function(p) { return p.$navVisible && !p.properties.offMenu }).length;

					self.topStyle = self.isLeft ? {} : { width: (100 / topItemCount) + "%" };
					self.tramlineTopStyle = { width: (100 / (topItemCount-1)) + "%" };
				}

				function setSubMenuWidth(topPage) {
					self.subStyle = self.isLeft ? {} : { width: (topPage.$navPages ? 100 / getPagesOnMenu(topPage.$navPages).length : 0) + "%" };
				}
				
				function handleFocusMode() {
					// Focus Management
					if ($(window).scrollTop() > 0) Scroll.scrollTo(0).then(proceed);
                    else proceed();

                    function proceed() {
                        if (item.properties.focusMode === "none") return;

                        //  Find focus element
                        //  Smart focus (set focus to navigator if present. If not, find first displayed header h1, h2, h3)
                        var isMobile = window.matchMedia("(max-width: "+Form.view.breakpoints[1]+"px)").matches,
                            navigator,
                            focusElement,
                            headings;


                        if (!isMobile && (!self.currentPage.properties.offMenu || self.uncollapsed)) {
                            navigator = $("nav[tabindex]");
                            if (navigator.length) focusElement = navigator[0];
                        } else if (!navigator || !navigator.length) {
                            var selectors = ["h1", "h2", "h3", "h4", "h5", "h6[tabindex]:visible"].join("[tabindex]:visible, "),
                                $currentPage = $(".id-"+self.currentPage.id);
                            // find headings
                            headings = $currentPage.find(selectors);
                            if (headings.length) focusElement = headings[0];
                        }

                        focusElement && focusElement.focus();
                    }
				}
			}
		}]);
});