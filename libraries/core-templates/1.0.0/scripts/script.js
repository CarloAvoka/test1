var $scope = $("form").scope();
console.log('javascript is working');
console.log('$scope', $scope);
$scope.$watch('Form.lastFocusedItem', function() {
  console.log('hey, Form.lastFocusedItem has changed!');
});