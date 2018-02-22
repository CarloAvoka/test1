define(["app"], function(app) {    
        app.ng.controller("ProgressBarController", ["$scope", "$element", "Form", "Resource", "Validation", "Util", "$timeout",
            function($scope, $element, Form, Resource, Validation, Util, $timeout) {                
                Form.getItem($scope, $element).then(function(item) {
                    function iniGroupIconsPos() {
                        Form.$Pages.flatPages.forEach(function(p) {                           
                            p.isLastInGroup = false;
                            p.isFirstInGroup = false;                            
                        });
                    }
                    function removeTooltip() {
                        if (!item.properties.displayPageName) {
                            $(document).ready(function() {
                                for(var i=0; i<Form.$Pages.flatPages.length; i++) {                                   
                                    var _id = '#' + item.id + '_pseb_' + i;                                   
                                    $(_id).removeAttr("title");                                    
                                } 
                            })                            
                        } else {
                            return;
                        }
                    }
                    function setGroupIconsPos() {
                        if (Form.$Pages.groups.length) {
                            Form.$Pages.groups.forEach(function(group) {
                                if (group.$navPages.length) {
                                    var keyOfLastPageInGroup = group.$navPages[group.$navPages.length-1].$$hashKey;
                                    var keyOfFirstPageInGroup = group.$navPages[0].$$hashKey;
                                 if (Form.$Pages.flatPages.length) {                                    
                                     Form.$Pages.flatPages.forEach(function(page) {
                                            if (page.$$hashKey === keyOfLastPageInGroup) {
                                             page.isLastInGroup = true;                                
                                            }
                                            if (page.$$hashKey === keyOfFirstPageInGroup) {                                   
                                             page.isFirstInGroup = true;
                                            }                               
                                        }) 
                                    }    
                                }                                                    
                            });
                        }
                    }
                    $scope.visiblePageFilter = function(p) {
                        return p.$navVisible && !p.properties.offMenu;
                    }                                                        
                    $timeout(function() {                        
                        iniGroupIconsPos();
                        removeTooltip();
                        setGroupIconsPos();
                    },0)
                });
            }
        ]);
    });