define(["app"], function(app) {    
        app.ng.controller("DockingErrorsController", ["$scope", "$element", "Form", "Resource", "Validation", "Util", "$timeout",
            function($scope, $element, Form, Resource, Validation, Util, $timeout) {    
              Form.getItem($scope, $element).then(function (item) {
				var data = $scope.data;
				$scope.$header = $('.id-formHeader');
				$scope.$watch("data.scrollPosition", function(newValue, oldValue) {
					if (!data.errorsDockLock) { 
						data.dockErrors = (!($(".av-menu-errors:visible").length > 0) || !data.undocked); 
					}
					var hh = $scope.$header.outerHeight();
					var sp = newValue;
					var dp = Form.getItemProperty("data.dockingController","dockPosition");
					var ds = hh * (1 - sp/dp);
					$element.css({"top": ds + "px"});
				 });
			  });
            }
        ]);
    });
